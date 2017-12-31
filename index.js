const config = require('./config.json')
//const webpush = require('web-push')
const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB()
var registrations = []

/**
 * Sends a push notification to a specified endpoint
 **/
function sendNotification(endpoint) {
//   webPush.sendNotification({
//     endpoint: endpoint
//   }).then(function() {
    console.log('Push Application Server - Notification sent to ' + JSON.stringify(endpoint));
//   }).catch(function() {
//     console.log('ERROR in sending Notification, endpoint removed ' + endpoint);
//     unregisterSubscription(endpoint);
//   });
}

/**
 * Remove a subscription registration from the server
 **/
function unregisterSubscription(endpoint) {
  // TODO: add call to remove registration from dynamo
}

/**
 * Filters the notification registrations down to those which
 * match the event
 **/
function getRegistrations(locationid, callback) {
  var params = {
    TableName : "laundry_notification_subscriptions",
    ProjectionExpression:"#id, #keys",
    FilterExpression: "locationid = :lid",
    ExpressionAttributeNames:{
        "#id": "endpoint",
        "#keys": "keys"
    },
    ExpressionAttributeValues: {
      ":lid": {
        "S": locationid
      }
    }
  }

  dynamodb.scan(params, function(err, data) {
    if(err) {
      console.log("Unable to query. Error:", JSON.stringify(err, null, 2));
      throw "Unable to query DynamoDB"
    }

    console.log("Found %s registered subscriptions for location %s", data.Items.length, locationid)

    // Convert from DynamoDB syntax into usable objects
    registrations = data.Items.map(recordToJSON);

    // Issue the callback to handle the results
    if(typeof callback === 'function') { callback() }
  })
}

/**
 * Converts a DynamoDB record of specific format into JSON
 **/
function recordToJSON (record) {
  var result = {
    endpoint: record.endpoint.S,
    keys: {
      auth: record.keys.M.auth.S,
      p256dh: record.keys.M.p256dh.S
    }
  }

  return result
}

/**
 * Loop through list of registrations and send notifcations
 **/
function processRegistrations() {
  console.log('Processing %s registrations.', registrations.length)
  registrations.forEach(function (el) {
    sendNotification(el.endpoint)
  })
}

// Consolidated entrypoint
function start (locationid) {
  getRegistrations(locationid, processRegistrations)
}

// AWS Lamda entry point
exports.pushNotification = function (event, context, callback) {
  // Map the triggering locationid
  var locationid = event.locationid
  start(locationid)
}

// Entry point for local Node.js
if (require.main === module) {
  start()
}