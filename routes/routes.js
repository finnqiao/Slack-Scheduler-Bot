// Dependencies
var express = require( 'express' );
var router = express.Router();
var fetch = require( 'node-fetch' );
var googleAuth = require( './googleAuth.js' );

var SlackClient = require( '@slack/client' );
    var RTMClient = SlackClient.RTMClient;
    var WebClient = SlackClient.WebClient;

if( !process.env.SLACK_ACCESS_TOKEN ) { throw new Error( 'process.env.SLACK_ACCESS_TOKEN not found' ); process.exit(1); return; }
if( !process.env.SLACK_BOT_ACCESS_TOKEN ) { throw new Error( 'process.env.SLACK_BOT_ACCESS_TOKEN not found' ); process.exit(1); return; }
if( !process.env.API_AI_ACCESS_TOKEN ) { throw new Error( 'process.env.API_AI_ACCESS_TOKEN not found' ); process.exit(1); return; }
if( !process.env.API_AI_DEV_TOKEN ) { throw new Error( 'process.env.API_AI_DEV_TOKEN not found' ); process.exit(1); return; }
if( !process.env.DOMAIN ) { throw new Error( 'process.env.DOMAIN not found' ); process.exit(1); return; }

var SLACK_ACCESS_TOKEN = process.env.SLACK_ACCESS_TOKEN;
var SLACK_BOT_ACCESS_TOKEN = process.env.SLACK_BOT_ACCESS_TOKEN;
var API_AI_ACCESS_TOKEN = process.env.API_AI_ACCESS_TOKEN;
var API_AI_DEV_TOKEN = process.env.API_AI_DEV_TOKEN;
var DOMAIN = process.env.DOMAIN;

// MongoDB Mongoose Models
var Models = require( '../models/models.js' );
    var Users = Models.Users;
    var Invite = Models.Invite;
    var Task = Models.Task;
    var Meeting = Models.Meeting;

/**
 * Create and set up Slackbot RTM ( Real Time Messaging ) and its event listener
 * Create and set up WebClient for Slackbot
 */
var rtm = new RTMClient( SLACK_BOT_ACCESS_TOKEN );
rtm.start();
var web = new WebClient( SLACK_BOT_ACCESS_TOKEN );

// userStatus is an Object to see if a User has a pending request - If so, that User must Confirm or Cancel that request before making a new request
  // The keys are User Slack Id's
  // The values are either null, or an object that represents a requested action
/**
 *  userStatus: {
      userId: {
        intent: String,   // meeting:add, reminderme:add
        subject: String,
        date: Date,
        datePeriod: [ start Date, end Date ] --- Unused
      }
    }
 */
var userStatus = {};

// Handle Slack Bot messages - delivering and receiving
// If the User has not given permissions for Google Calendar, prompt the User to
rtm.on( 'message', ( event ) => {
    if( event.subtype === "bot_message" ) return;
    // Check if User exists on Database ( MongoDB ) --- If not, ask them to allow Google Calendar Permissions
    var userId = event.user;
    
    // web.chat.postMessage({
        // "channel": event.channel,
        // "text": "Google Log In: " + DOMAIN + "/auth?auth_id="
    // });
    // return;
    // If the User has a pending request, ask them to Confirm or Cancel
    if( userStatus[ userId ] ) {
        web.chat.postMessage({
            "channel": event.channel,
            "text": "Looks like you have a response to answer, please Confirm or Cancel."
        });
        return;
    }
    // Else, Save the User's Request, and Ask them to Confirm or Cancel
    fetch( 'https://api.dialogflow.com/v1/query?v=20150910', {
        method: 'POST',
        headers: { "Authorization": "Bearer " + API_AI_ACCESS_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({
            sessionId: "aixm84625",
            lang: 'en',
            query: event.text
        })
    })
    .catch( aiError => { console.log( "Api AI Error: " + aiError ); } )
    .then( response => response.json() )
    .then( response => {
        if( response.result.actionIncomplete || response.result.action === "input.welcome" || response.result.metadata.intentName === "Default Welcome Intent" ) {
            web.chat.postMessage({
                "channel": event.channel,
                "text": response.result.fulfillment.speech
            });
            return;
        }
        var intent = response.result.metadata.intentName;
        var subject = response.result.parameters.subject ? response.result.parameters.subject.join( ' ' ) : null;
        var time = response.result.parameters.time;
        var date = response.result.parameters.date;
        var datePeriod = response.result.parameters[ "date-period" ];
        userStatus[ userId ] = { intent, subject, time, date, datePeriod };
        
        web.chat.postMessage({
            "channel": event.channel,
            // "text": event.text,
            "attachments": [{
                "text": response.result.fulfillment.speech,
                "fallback": "Unable to confirm a Reminder or Meeting",
                "callback_id": "confirm",
                "actions": [
                    { "type": "button", "name": "select", "value": "yes", "text": "Confirm" },
                    { "type": "button", "name": "select", "value": "no", "text": "Cancel", "style": "danger" }
                ]
            }]
        });
    });
});

// Routes
router.post( '/', ( req, res ) => { res.send("Connected to Slack Scheduler Bot") });

router.get( '/auth', ( req, res ) => {
    // Google Calendar Authentication - Prompt the User if they have not given permission
    // if( !req.query.auth_id ) { throw new Error( 'auth_id not found (in query)' ); return; }
    var url = googleAuth.generateAuthUrl( req.query.auth_id );
    res.redirect( url )
});

router.get( '/connect/callback', ( req, res ) => {
    // Callback after a User has logged in through Google
    if( !req.query.code ) { return res.send( "No Code/Token found, try again." ); }
    googleAuth.getToken( req.query.code )
    .catch( codeGetError => res.status(500).send( "Google OAuth2 Code Get Error:", codeGetError ) )
    .then( tokens => {
        res.json( tokens );
    });
});

router.post( '/slack/action', ( req, res ) => {
    // Handle event when User clicks on "Cancel" or "Confirm"
    var action = JSON.parse( req.body.payload );
    var confirmSelect = action.actions[0].value;
    var userId = String(action.user.id);
    
    var intent;
    switch( userStatus[ userId ].intent ) {
        case "reminderme:add": intent = "Reminder"; break;
        case "meeting:add": intent = "Meeting"; break;
    }
    var time = userStatus[ userId ].time;
    var date = userStatus[ userId ].date;
    var subject = userStatus[ userId ].subject;
    var responseString = "";
    
    if( confirmSelect === "yes" ) { responseString += "Confirmed "; }
    else if( confirmSelect === "no" ) { responseString += "Cancelled "; }
    responseString += intent;
    if( subject ) { responseString += ' to \"' + subject + '"'; }
    if( time ) { responseString += " at " + time; }
    if( date ) responseString += " on " + date;
    responseString += '.'
    userStatus[ userId ] = null;
    res.send( responseString );
});

module.exports = router;
