const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const imgDir = path.join(__dirname, '../../public/uploads/productos');
if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imgDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'prod-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + ext);
  }
});

const imageFilter = (req, file, cb) =>
  cb(null, ['.jpg', '.jpeg', '.png', '.webp'].includes(
    path.extname(file.originalname).toLowerCase()
  ));

const uploadImage = multer({
  storage:    imageStorage,
  fileFilter: imageFilter,
  limits:     { fileSize: 2 * 1024 * 1024 }
});

const uploadCsv = multer({
  storage:    multer.memoryStorage(),
  fileFilter: (req, file, cb) =>
    cb(null, path.extname(file.originalname).toLowerCase() === '.csv'),
  limits: { fileSize: 500 * 1024 }
});

module.exports = { uploadImage, uploadCsv };
