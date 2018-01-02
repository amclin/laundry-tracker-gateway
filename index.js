const config = require('./config.json')
const webPush = require('web-push')
const AWS = require('aws-sdk')
const deepEqual = require('deep-equal')
const dynamodb = new AWS.DynamoDB.DocumentClient()
var registrations = []
var EVENT = {}

webPush.setVapidDetails(
  'mailto:' + config.email,
  config.publickey,
  config.privatekey
)

/**
 * Sends a push notification to a specified endpoint
 **/
function sendNotification (subscription, payload) {
  // const subscription = {
  // endpoint: '< Push Subscription URL >',
  //   keys: {
  //     p256dh: '< User Public Encryption Key >',
  //     auth: '< User Auth Secret >'
  //   }
  // }

  webPush.sendNotification(
    subscription,
    payload
  ).then(function () {
    console.log('Push Application Server - Notification sent to ' + subscription.endpoint)
  }).catch(function (error) {
    if (error) {
      console.log('ERROR in sending Notification: ', subscription.endpoint)
    }
    unregisterSubscription(subscription.endpoint)
  })
}

/**
 * Parses the event to determine which machines changed state
 *
 * @param event Event data provided from DynamoDB
 * @return array List of changed machines with their current state
 **/
function getChangedMachines (event) {
  const current = event.Records[0].dynamodb.NewImage.states.L
  const old = event.Records[0].dynamodb.OldImage.states.L
  var machines = []

  // Loop through the current machine states and find any
  // that differ from the previous state for the same machine ID
  current.forEach(function (machine) {
    const id = machine.M.machine.S
    const newState = machine.M.state.BOOL
    const oldState = old.find(function (el) {
      return el.M.machine.S === id
    }).M.state.BOOL

    if (newState !== oldState) {
      machines.push({
        id: id,
        state: newState
      })
    }
  })

  return machines
}

/**
 * Remove a subscription registration from the server
 **/
function unregisterSubscription (endpoint) {
  console.log('Removing subscription: ', endpoint)
  var params = {
    'TableName': 'laundry_notification_subscriptions',
    'Key': {
      'endpoint': endpoint
    }
  }

  dynamodb.delete(params, function (err, data) {
    if (err) {
      console.log('Unable to delete. Error:', JSON.stringify(err, null, 2))
      throw new Error('Unable to delete from DynamoDB')
    }
  })
}

/**
 * Filters the notification registrations down to those which
 * match the event
 **/
function getRegistrations (locationid, callback) {
  var params = {
    TableName: 'laundry_notification_subscriptions',
    ProjectionExpression: '#id, #keys',
    FilterExpression: 'locationid = :lid',
    ExpressionAttributeNames: {
      '#id': 'endpoint',
      '#keys': 'keys'
    },
    ExpressionAttributeValues: {
      ':lid': locationid
    }
  }

  dynamodb.scan(params, function (err, data) {
    if (err) {
      console.log('Unable to query. Error:', JSON.stringify(err, null, 2))
      throw new Error('Unable to query DynamoDB')
    }

    console.log('Found %s registered subscriptions for location %s', data.Items.length, locationid)

    registrations = data.Items

    // Issue the callback to handle the results
    if (typeof callback === 'function') { callback() }
  })
}

/**
 * Loop through list of registrations and send notifcations
 **/
function processRegistrations () {
  console.log('Processing %s registrations.', registrations.length)
  const payload = JSON.stringify({
    machines: getChangedMachines(EVENT)
  })

  console.log('Payload is:', JSON.stringify(payload));

  registrations.forEach(function (subscription) {
    sendNotification(subscription, payload)
  })
}

// AWS Lamda entry point
exports.pushNotification = function (event, context, callback) {
  const newRecord = event.Records[0].dynamodb.NewImage
  const oldRecord = event.Records[0].dynamodb.OldImage
  const location = event.Records[0].dynamodb.Keys.location.S

  // Don't do anything unless there was a change
  if (deepEqual(newRecord.states, oldRecord.states)) {
    console.log('Exiting, no change to machine states in %s', location)
    return
  }

  EVENT = event

  // Run the notifications
  getRegistrations(location, processRegistrations)
}
