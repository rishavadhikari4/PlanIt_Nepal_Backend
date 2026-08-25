const Contact = require("../models/Contact");
const { containsFilter } = require('../middleware/sanitize');

exports.postContactForm = async (req, res) => {
  const { name, email, phone, subject, budget, message } = req.body;
  try {
    if (!name || !email || !phone || !subject || !budget || !message) {
      return res.status(400).json({
        success: false,
        message: "Please Fill All Fields"
      });
    }
    const newContact = new Contact({
      name,
      email,
      phone,
      subject,
      budget,
      message
    });
    await newContact.save();
    return res.status(201).json({
      success: true,
      message: "Contact Created Successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.getContactForms = async (req, res) => {
  try {
    const { subject, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    let filter = {};
    if (subject) {
      filter.subject = containsFilter(subject);
    }
    const contacts = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();
    const total = await Contact.countDocuments(filter);
    if (!contacts || contacts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No contacts found"
      });
    }
    return res.status(200).json({
      success: true,
      message: "Contacts fetched successfully",
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      contacts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

exports.getContactFormById = async (req, res) => {
  const contactId = req.params.contactId;
  try {
    const contact = await Contact.findById(contactId).lean();
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact Not Found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Contact form fetched SuccessFully",
      data: { contact }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.deleteContactForm = async (req, res) => {
  const contactId = req.params.contactId;
  try {
    const contact = await Contact.findByIdAndDelete(contactId);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "No Contacts Message Found"
      });
    }
    res.status(200).json({
      success: true,
      message: "Contact Form Deleted SuccessFully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};





/* ------------------------------------------------------------------ *
 * Working an enquiry
 *
 * Reading and deleting was the whole of it before, so an enquiry either got
 * answered out of band or not at all, and nobody could tell which.
 * ------------------------------------------------------------------ */

const { sendEnquiryReplyEmail } = require('../utils/emailHelper');

const STATUSES = ['new', 'in_progress', 'answered', 'closed'];

/** Moves an enquiry through the queue. */
exports.updateContactStatus = async (req, res) => {
  try {
    const { status, internalNote } = req.body;

    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${STATUSES.join(', ')}`,
      });
    }

    const update = {};
    if (status !== undefined) update.status = status;
    if (internalNote !== undefined) update.internalNote = String(internalNote).trim().slice(0, 2000) || null;

    if (!Object.keys(update).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    const contact = await Contact.findByIdAndUpdate(req.params.contactId, update, { new: true });
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Enquiry updated',
      data: { contact },
    });
  } catch (error) {
    console.error('Error updating enquiry:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Replies to an enquiry by email and records what was said.
 *
 * The reply is stored whether or not the mail goes out — a send that fails
 * must not lose the text someone just wrote, and `emailed: false` tells the
 * next person to follow up by hand.
 */
exports.replyToContact = async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    if (body.length < 2) {
      return res.status(400).json({ success: false, message: 'Write a reply before sending it.' });
    }
    if (body.length > 4000) {
      return res.status(400).json({ success: false, message: 'Replies are limited to 4000 characters.' });
    }

    const contact = await Contact.findById(req.params.contactId);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }

    let emailed = false;
    let warning = null;
    try {
      await sendEnquiryReplyEmail(contact, body, req.user?.name);
      emailed = true;
    } catch (mailError) {
      console.error('Enquiry reply email failed:', mailError.message);
      warning = 'The reply was saved but the email did not send. Follow up by phone.';
    }

    contact.replies.push({
      body,
      sentBy: req.user?.id,
      sentByName: req.user?.name || 'Staff',
      emailed,
    });
    contact.status = 'answered';
    await contact.save();

    return res.status(200).json({
      success: true,
      message: emailed ? `Reply sent to ${contact.email}` : 'Reply saved',
      warning,
      data: { contact },
    });
  } catch (error) {
    console.error('Error replying to enquiry:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
