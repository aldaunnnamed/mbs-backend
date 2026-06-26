const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ── Filtros ──────────────────────────────────────────────────
const imageFilter = (req, file, cb) =>
  cb(null, ['.jpg', '.jpeg', '.png', '.webp'].includes(
    path.extname(file.originalname).toLowerCase()
  ));

// ── Imágenes de productos ─────────────────────────────────────
const imgDir = path.join(__dirname, '../../public/uploads/productos');
if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imgDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'prod-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + ext);
  }
});

const uploadImage = multer({
  storage:    imageStorage,
  fileFilter: imageFilter,
  limits:     { fileSize: 2 * 1024 * 1024 }
});

// ── Logo ──────────────────────────────────────────────────────
const logoDir = path.join(__dirname, '../../public/uploads/logo');
if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, 'logo' + ext);
  }
});

const uploadLogo = multer({
  storage:    logoStorage,
  fileFilter: imageFilter,
  limits:     { fileSize: 2 * 1024 * 1024 }
});

// ── CSV ───────────────────────────────────────────────────────
const uploadCsv = multer({
  storage:    multer.memoryStorage(),
  fileFilter: (req, file, cb) =>
    cb(null, path.extname(file.originalname).toLowerCase() === '.csv'),
  limits: { fileSize: 500 * 1024 }
});

module.exports = { uploadImage, uploadCsv, uploadLogo };
