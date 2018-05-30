import React, { PureComponent } from 'react'
import { AsyncStorage, Platform } from 'react-native'
import createReactClass from 'create-react-class'

let _state = {}
let _listeners = []
let _middlewares = []
let _actions = {}
let _reducers = { loadStore: storedStore => storedStore }
let _dispatchers = {}
let _persistFilter = store => { }

function init (actions, reducers, middlewares, persistFilter) {
	_middlewares = middlewares
	_persistFilter = persistFilter
	actions.forEach((action) => { _actions = { ..._actions, ...action } })
	reducers.forEach((reducer) => { _state = { ..._state, ...reducer.init() }; _reducers = { ..._reducers, ...reducer } })
	Object.keys(_actions).forEach((action) => { _dispatchers[action] = (...params) => mutate(action, params) })
	_state.loadStore = 'inprogress'
	AsyncStorage.getItem('state_' + Platform.OS).then(state => {
		let storedStore = {}
		if (state !== null) {
			storedStore = JSON.parse(state)
		}
		storedStore.loadStore = 'finish'
		mutate('loadStore', storedStore)
	})
}

function connect (container, map) {
	return createReactClass({ render: function () { return <Listener transform={this.props.transform} root={container} map={map} /> } })
}

function mutate (actionName, params) {
	let prevState, prevTime
	if (__DEV__) {
		prevState = JSON.stringify(_state)
		prevTime = window.performance.now()
	}
	if (params === undefined) params = []
	let paramsForAction = params.length !== undefined ? params : [params]
	let actionResult = _actions[actionName] ? _actions[actionName](...paramsForAction, { state: _state, mutate }) : params
	if (typeof actionResult === 'function') { actionResult = actionResult(mutate, _state); }
	let diff = _reducers[actionName] ? _reducers[actionName](actionResult, _state) : {}
	_state = { ..._state, ...diff }
	_listeners.forEach(l => l.setState(_state))
	AsyncStorage.setItem('state_' + Platform.OS, JSON.stringify(_persistFilter(_state)))
	if (__DEV__) {
		let newState = JSON.stringify(_state)
		let newTime = window.performance.now()
		report(prevState, actionName, params, actionResult, diff, newState, newTime - prevTime)
	}
	_middlewares.forEach((middleware) => middleware(mutate, actionName, actionResult))
}

async function report (prevState, actionName, params, result, diff, newState, exectime) {
	console.group('%caction', 'color:grey;font-weight:bold;', actionName)
	console.log('%cprev state', 'color:#f17b5e;font-weight:bold;', JSON.parse(prevState))
	console.log('%caction', 'color:#03A9F4;font-weight:bold;', { params, result, diff })
	console.log('%cnew state', 'color:#4CAF50;font-weight:bold;', JSON.parse(newState))
	console.log('%cconsumed', 'color:#f25e99;font-weight:bold;', exectime.toFixed(2) + 'ms')
	if (result !== undefined && result.log !== undefined) {
		console.log(...result.log)
	}
	console.groupEnd()
}

class Listener extends PureComponent {
	componentWillMount () {
		_listeners.push(this)
	}
	componentWillUnmount () {
		_listeners.splice(_listeners.indexOf(this), 1)
	}
	render () {
		return <this.props.root transform={this.props.transform} {...this.props.map(_state)} actions={_dispatchers} />
	}
}

module.exports = { init, mutate, connect }
