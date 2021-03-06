var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var Mixed = Schema.Types.Mixed;

if ( !process.env.MONGODB_URI ) {
    console.log( 'Error: MONGODB_URI is not set. Did you run source env.sh ?' );
    throw new Error( 'Error: MONGODB_URI is not set. Did you run source env.sh ?' )
    process.exit(1);
    return;
}
mongoose.connect( process.env.MONGODB_URI );
mongoose.Promise = global.Promise;

var UserSchema = Schema({
  /** googleTokens: {
        access_token: String,
        id_token: String,
        refresh_token: String,
        token_type: String,     // default: "Bearer"
        expiry_date: Date
      }
  */
  googleTokens: { type: Mixed },
  // Default meeting length: 30 minutes
  defaultMeetingLength: { type: Number, default: 30 },
  slackId: { type: String },
  slackUsername: { type: String },
  slackEmail: { type: String },
  slackDmIds: { type: Array },
  // User Status - whether the Slack Bot has given the User a request or not
  // User.status is either an Object that represents the request, or null
  /** status: {
        intent: String,   // meeting:add, reminderme:add
        subject: String,
        time: String      // HH:MM:SS format
        date: Date,
        datePeriod: [ start Date, end Date ] --- Unused
      }
  */
  status: { type: Mixed }
});

var ReminderSchema = Schema({
    subject: { type: String, required: true },
    day: { type: String, required: true },      // date format: YYYY-MM-DD
    eventId: { type: String },
    slackId: { type: String }
});

var MeetingSchema = Schema({
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    invitees: { type: Array, required: true },
    subject: { type: String },
    location: { type: String },
    calenderFields: { type: Object },
    status: { type: String },     // Meeting status: "Pending", or "Scheduled"
    createdAt: { type: Date },
    requesterId: { type: String }     // User's Slack Id
});

var InviteSchema = Schema({
    eventId: { type: String },
    inviteeId: { type: ObjectId, ref: 'User' },
    requesterId: { type: ObjectId, ref: 'User' },
    status: { type: String }
});

// Find or Create a User by SlackId
UserSchema.statics.findOrCreate = ( slackId ) => {
    return User.findOne( { slackId: slackId } )
    .then( foundUser => {
        if( foundUser ) return foundUser;
        return new User( { slackId: slackId } ).save();
    })
    .catch( error => console.log( "User Find or Create Error:", error ) );
};

var Reminder = mongoose.model( 'Reminder', ReminderSchema );
var Meeting = mongoose.model( 'Meeting', MeetingSchema );
var User = mongoose.model( 'User', UserSchema );
var Invite = mongoose.model( 'Invite', InviteSchema );

module.exports = {
    Reminder: Reminder,
    Meeting: Meeting,
    User: User,
    Invite: Invite
};
