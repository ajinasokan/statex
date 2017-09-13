import { init, connect } from './statex'
import http from './http'

let middlewares = { http }

module.exports = { init, connect, middlewares }
