const config = require('./config.json')
const webpush = require('web-push')

function start () {
	console.log('Public key:', config.publickey)
}

// AWS Lamda entry point
exports.pushNotification = function (event, context, callback) {
  start()
}

// Entry point for local Node.js
if (require.main === module) {
  start()
}