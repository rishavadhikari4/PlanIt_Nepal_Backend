const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const isExtValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const isMimeValid = allowedTypes.test(file.mimetype);
    if (isExtValid && isMimeValid) {
        return cb(null, true);
    }
    cb(new Error('Only images are allowed'));
};

/* memoryStorage with no limit means one request can hold the whole file in
   RAM — a handful of large uploads is enough to exhaust the process. */
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024,  // 5MB, matching the client-side check
        files: 10,
        fields: 20,
        parts: 30,
    },
});

module.exports = upload;