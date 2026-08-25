
const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    budget:{
        type:String,
        required:true
    },
    subject: {
        type: String,
        required: true,
    },
    message: {
        type: String
    },
    /* An enquiry used to be read-only: staff could open it and delete it, and
       nothing else. With no state, the only way to know whether someone had
       answered was to ask them. */
    status: {
        type: String,
        enum: ['new', 'in_progress', 'answered', 'closed'],
        default: 'new',
        index: true
    },
    /* The reply that was sent, kept so the next person to open the enquiry
       can see what was already said. */
    replies: [{
        body: {
            type: String,
            required: true,
            trim: true,
            maxlength: 4000
        },
        sentBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        sentByName: {
            type: String
        },
        emailed: {
            type: Boolean,
            default: false
        },
        sentAt: {
            type: Date,
            default: Date.now
        }
    }],
    /* Staff notes that never reach the customer. */
    internalNote: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: null
    }
}, {timestamps: true});

/* Enquiries are listed newest-first and filtered by subject. */
contactSchema.index({ createdAt: -1 });
contactSchema.index({ subject: 1 });
/* The queue view: everything still open, oldest first, so nothing ages out
   of sight. */
contactSchema.index({ status: 1, createdAt: -1 });

const Contact = mongoose.model("Contact", contactSchema);

module.exports = Contact;
