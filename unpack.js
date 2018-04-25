export default function unpack (meta, raw) {
	let res

	if (['string', 'number', 'boolean'].includes(typeof (meta)) || raw === null) {
		if (typeof (meta) !== typeof (raw) && raw !== null) return undefined
		res = raw
	} else if (meta instanceof Array && raw instanceof Array) {
		res = []
		for (var j = 0; j < raw.length; j++) {
			res[j] = unpack(meta[0], raw[j])
			if (res[j] === undefined) return undefined
		}
	} else if (typeof meta === 'object') {
		res = {}
		let keys = Object.keys(meta)

		for (var i = 0; i < keys.length; i++) {
			let mfield = meta[keys[i]]
			let rfield = raw[keys[i].split('__')[0]]

			if (typeof (mfield) !== typeof (rfield) && rfield !== null && typeof mfield !== 'function') return undefined

			res[keys[i].split('__')[1]] = unpack(mfield, rfield)
			if (res[keys[i].split('__')[1]] === undefined) return undefined
		}
	} else if (typeof meta === 'function') {
		return meta(raw)
	}

	return res
}
