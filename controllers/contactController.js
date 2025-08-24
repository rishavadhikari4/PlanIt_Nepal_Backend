const Contact = require("../models/Contact");

exports.postForm = async (req,res)=>{
    const {name,email,phone,subject,budget,message}= req.body;
    try{
        if(!name || !email || !phone || !subject ||!budget || !message){
            return res.status(400).json({
            success:false,
            message:"Please Fill All Fields"
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
            success:true,
            message:"Contact Created Successfully"
        });
    }catch(error){
        console.error(error);
        res.status(500).json({
            success:false,
            message:"Internal Server Error",
        });
    }
    
}


exports.getContacts = async (req, res) => {
  try {
    const { subject, page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    let filter = {};
    if (subject) {
      filter.subject = { $regex: subject, $options: "i" };
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
    console.error(error.message);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};





