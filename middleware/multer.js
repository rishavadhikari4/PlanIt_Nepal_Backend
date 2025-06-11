const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const fileFilter = (req,file,cb)=>{
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if(extname && mimetype){
        return cb(null,true);
    }
    cb(new Error('Only images are allowed'));
};
const upload = multer({storage,fileFilter});

module.exports = upload;