import { AsyncStorage } from 'react-native'
import unpack from './unpack'

async function http (mutate, actionName, actionResult, config) {
	// not http call
	if (actionResult === undefined || actionResult.payload === undefined) return

	// logs
	let prevTime
	let networkTime
	let parseTime
	if (__DEV__) {
		prevTime = window.performance.now()
	}

	let enc = encodeURIComponent
	let queryStringify = dict => Object.entries(dict).map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&')
	let { method, url, params, data, content } = actionResult.payload

	// fallbacks
	if (method === undefined) method = 'GET'
	if (data === undefined) data = {}
	if (params === undefined) params = {}
	if (content === undefined) content = 'json'

	// setup
	let body
	let fullUrl = url
	for (let param in params) {
		if (fullUrl.includes(':' + param)) {
			fullUrl = fullUrl.replace(':' + param, params[param])
			delete params[param]
		}
	}
	let urlparams = queryStringify(params)
	if (urlparams !== '') fullUrl += '?' + urlparams
	method = method.toUpperCase()

	// cache
	var headers = new Headers()
	if (method === 'GET') {
		let etag = await AsyncStorage.getItem('etag_' + url)
		if (etag !== undefined) headers.append('If-None-Match', etag)
	}

	// content type
	if (method === 'POST' || method === 'PUT') {
		if (content === 'form') {
			headers.append('content-type', 'application/x-www-form-urlencoded')
			body = queryStringify(data)
		} else {
			headers.append('content-type', 'application/json')
			body = JSON.stringify(data)
		}
	}

	// calls
	let res
	try {
		let params = { fullUrl, method, headers, body }
		if (config && config.beforeRequest) {
			params = config.beforeRequest(params)
		}
		if (actionResult.payload.cacheAge !== undefined) {
			let cachedon = await AsyncStorage.getItem('cachedon_' + fullUrl)
			if (cachedon === null) cachedon = 0
			if (new Date().getTime() - cachedon < actionResult.payload.cacheAge * 1000) {
				res = { status: 304, _bodyText: '' }
			} else {
				res = await fetch(params.fullUrl, { method: params.method, headers: params.headers, body: params.body, timeout: 10000 })
			}
		} else {
			res = await fetch(params.fullUrl, { method: params.method, headers: params.headers, body: params.body, timeout: 10000 })
		}
	} catch (error) {
		res = { ok: false, status: 'network', headers: { map: { 'content-type': [''] } } }
	}
	if (config && config.afterRequest) {
		res = config.afterRequest(res)
	}

	if (__DEV__) {
		networkTime = (window.performance.now() - prevTime).toFixed(2)
	}

	if (res.ok) {
		// all good
		let result = { data: await res.json() }
		if (actionResult.payload.struct !== undefined) {
			result.data = unpack(actionResult.payload.struct, result.data)
		}
		if (__DEV__) {
			parseTime = (window.performance.now() - prevTime - networkTime).toFixed(2)
			result.log = ['%cresponse %c' + networkTime + 'ms %cparse %c' + parseTime + 'ms', 'color:#26A69A;font-weight:bold;', '', 'color:#26A69A;font-weight:bold;', '']
		}
		if (result.data === undefined) {
			let result = { data: { 'status': 'error', 'message': 'Parse error', 'error_type': res.status } }
			mutate(actionName + 'Fail', result)
		} else {
			mutate(actionName + 'Success', result)
			if (method === 'GET') {
				let etag = res.headers.get('etag')
				if (!etag) etag = ''
				AsyncStorage.setItem('etag_' + fullUrl, etag)
				AsyncStorage.setItem('cache_' + fullUrl, res._bodyText)
				AsyncStorage.setItem('cachedon_' + fullUrl, new Date().getTime().toString())
			}
		}
	} else if (res.status === 304) {
		// use cache
		let result = { data: JSON.parse(await AsyncStorage.getItem('cache_' + fullUrl)) }
		if (actionResult.payload.struct !== undefined) {
			result.data = unpack(actionResult.payload.struct, result.data)
		}
		if (__DEV__) {
			parseTime = (window.performance.now() - prevTime - networkTime).toFixed(2)
			result.log = ['%ccache %c' + networkTime + 'ms %cparse %c' + parseTime + 'ms', 'color:#26A69A;font-weight:bold;', '', 'color:#26A69A;font-weight:bold;', '']
		}
		if (result.data === undefined) {
			let result = { data: { 'status': 'error', 'message': 'Parse error', 'error_type': res.status } }
			mutate(actionName + 'Fail', result)
		} else {
			mutate(actionName + 'Success', result)
		}
	} else if (res.headers.map['content-type'][0] === 'application/json') {
		// normal errors
		let result = { data: await res.json() }
		if (__DEV__) {
			parseTime = (window.performance.now() - prevTime - networkTime).toFixed(2)
			result.log = ['%cresponse %c' + networkTime + 'ms %cparse %c' + parseTime + 'ms', 'color:#26A69A;font-weight:bold;', '', 'color:#26A69A;font-weight:bold;', '']
		}
		mutate(actionName + 'Fail', result)
	} else {
		// bad
		let result = { data: { 'status': 'error', 'message': 'Connection error', 'error_type': res.status } }
		if (__DEV__) {
			parseTime = (window.performance.now() - prevTime - networkTime).toFixed(2)
			result.log = ['%cresponse %c' + networkTime + 'ms %cparse %c' + parseTime + 'ms', 'color:#26A69A;font-weight:bold;', '', 'color:#26A69A;font-weight:bold;', '']
		}
		mutate(actionName + 'Fail', result)
	}

	if (config && config.afterMutate) {
		config.afterMutate(res, mutate)
	}
}

export default (config) => (...params) => http(...params, config)
