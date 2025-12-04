const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Email configuration (update with your SMTP details)
const emailConfig = {
  host: process.env.EMAIL_HOST || 'smtp.example.com',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER || 'user@example.com',
    pass: process.env.EMAIL_PASS || 'password'
  }
};

const transporter = nodemailer.createTransport(emailConfig);

// ---- Constants and Configuration ----

const DATA_DIR = __dirname;
const HOMEWORK_FILE = path.join(DATA_DIR, 'homework.json');
const TEACHER_FILE = path.join(DATA_DIR, 'teacher_logins.txt');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, PNG, and TXT files are allowed.'), false);
    }
  }
});

// ---- Data Management Functions ----

function loadHomeworks() {
  try {
    if (!fs.existsSync(HOMEWORK_FILE)) return [];
    const raw = fs.readFileSync(HOMEWORK_FILE, 'utf8');
    if (!raw.trim()) return [];
    
    const homeworks = JSON.parse(raw);
    // Ensure all homeworks have required fields
    return homeworks.map(hw => ({
      id: hw.id || uuidv4(),
      title: hw.title || 'Untitled',
      subject: hw.subject || '',
      description: hw.description || '',
      dueDate: hw.dueDate || new Date().toISOString(),
      createdAt: hw.createdAt || new Date().toISOString(),
      updatedAt: hw.updatedAt || new Date().toISOString(),
      completed: hw.completed || false,
      priority: hw.priority || 'medium',
      tags: Array.isArray(hw.tags) ? hw.tags : [],
      attachments: Array.isArray(hw.attachments) ? hw.attachments : [],
      teacherEmail: hw.teacherEmail || '',
      teacherName: hw.teacherName || '',
      yearGroup: hw.yearGroup || '',
      className: hw.className || '',
      isRecurring: hw.isRecurring || false,
      recurrence: hw.recurrence || { type: 'none', interval: 1, daysOfWeek: [] },
      nextOccurrence: hw.nextOccurrence || null,
      parentId: hw.parentId || null,
      comments: Array.isArray(hw.comments) ? hw.comments : []
    }));
  } catch (err) {
    console.error('Error reading homework.json', err);
    return [];
  }
}

function saveHomeworks(list) {
  try {
    // Ensure we're not saving internal properties
    const sanitizedList = list.map(({ _id, __v, ...rest }) => ({
      ...rest,
      updatedAt: new Date().toISOString()
    }));
    
    fs.writeFileSync(HOMEWORK_FILE, JSON.stringify(sanitizedList, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing homework.json', err);
    return false;
  }
}

function loadTeacherLogins() {
  const map = new Map();
  try {
    if (!fs.existsSync(TEACHER_FILE)) return map;
    const raw = fs.readFileSync(TEACHER_FILE, 'utf8');
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split(':');
      const email = parts[0];
      const password = parts[1] || '';
      const name = parts[2] || '';
      if (email && password) {
        map.set(email.toLowerCase(), { email, password, name });
      }
    }
  } catch (err) {
    console.error('Error reading teacher_logins.txt', err);
  }
  return map;
}

function loadTemplates() {
  try {
    if (!fs.existsSync(TEMPLATES_FILE)) return [];
    const raw = fs.readFileSync(TEMPLATES_FILE, 'utf8');
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading templates.json', err);
    return [];
  }
}

function saveTemplates(list) {
  try {
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing templates.json', err);
  }
}

// Create necessary directories if they don't exist
[UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Initialize empty files if they don't exist
[COMMENTS_FILE].forEach(file => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '[]', 'utf8');
  }
});

// ---- Middleware ----

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Rate limiting middleware
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Apply rate limiting to all API routes
app.use('/api/', limiter);

// Simple CORS - allow all origins for development, works on Vercel too
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-secret-key', // Change this to a secure secret in production
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Trust first proxy
  sessionConfig.cookie.secure = true; // Serve secure cookies
}

app.use(session(sessionConfig));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'amsi-homework-secret-key-change-in-production',
    resave: true, // Changed to true for better compatibility
    saveUninitialized: false,
    name: 'homework.sid', // Custom session name
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
      httpOnly: true,
      secure: false, // false for HTTP, true for HTTPS (Vercel handles this)
      sameSite: 'lax',
      path: '/',
    },
  })
);

// Static assets
// For local development: /images/** served from ./images
app.use('/images', express.static(path.join(__dirname, 'images')));
// Frontend HTML/CSS/JS in ./public
app.use(express.static(path.join(__dirname, 'public')));

// ---- API routes ----

// Get all homework (public - students)
app.get('/api/homework', (req, res) => {
  const all = loadHomeworks();
  res.json(all);
});

// Teacher login - completely rebuilt
app.post('/api/login', (req, res) => {
  console.log('Login attempt received');
  try {
    const { email, password } = req.body || {};
    
    console.log('Email received:', email ? 'yes' : 'no', 'Password received:', password ? 'yes' : 'no');
    
    if (!email || !password) {
      console.log('Missing email or password');
      return res.status(400).json({ error: 'Email and password required' });
    }

    const logins = loadTeacherLogins();
    console.log('Loaded logins:', logins.size, 'entries');
    
    const emailLower = String(email).toLowerCase().trim();
    const record = logins.get(emailLower);
    
    console.log('Looking for email:', emailLower);
    console.log('Found record:', record ? 'yes' : 'no');
    
    if (!record) {
      console.log('No record found for email');
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    if (record.password !== password) {
      console.log('Password mismatch');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Set session data
    req.session.teacherEmail = record.email;
    req.session.teacherName = record.name || record.email;
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Failed to create session' });
      }
      
      console.log('Login successful for:', record.email);
      console.log('Session ID:', req.sessionID);
      
      res.json({ 
        success: true,
        teacherEmail: record.email, 
        teacherName: req.session.teacherName,
        email: record.email 
      });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login: ' + err.message });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  console.log('Logout requested');
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    console.log('Logout successful');
    res.json({ ok: true, message: 'Logged out successfully' });
  });
});

// Helper middleware - check if teacher is logged in
function requireTeacher(req, res, next) {
  console.log('Checking teacher auth, session:', req.session ? 'exists' : 'missing');
  console.log('Session teacherEmail:', req.session?.teacherEmail || 'none');
  
  if (!req.session || !req.session.teacherEmail) {
    console.log('Teacher not authenticated');
    return res.status(401).json({ error: 'Not signed in. Please log in again.' });
  console.log('Teacher authenticated:', req.session.teacherEmail);
  next();
}

// ---- Middleware Functions ----

/**
 * Middleware to check if user is authenticated as a teacher
 */
function requireTeacher(req, res, next) {
  if (req.session && req.session.teacherEmail) {
    return next();
  }
  res.status(401).json({ 
    success: false,
    error: 'Authentication required',
    code: 'AUTH_REQUIRED'
  });
}

/**
 * Middleware to check if user has permission to modify a homework
 */
async function checkHomeworkPermission(req, res, next) {
  try {
    const homeworkId = req.params.id;
    const homeworks = loadHomeworks();
    const homework = homeworks.find(h => h.id === homeworkId);
    
    if (!homework) {
      return res.status(404).json({ 
        success: false, 
        error: 'Homework not found',
        code: 'NOT_FOUND'
      });
    }
    
    // Allow admins or the original teacher to modify
    if (req.session.isAdmin || homework.teacherEmail === req.session.teacherEmail) {
      req.homework = homework;
      return next();
    }
    
    res.status(403).json({ 
      success: false, 
      error: 'You do not have permission to modify this homework',
      code: 'PERMISSION_DENIED'
    });
  } catch (error) {
    console.error('Permission check error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during permission check',
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * Error handling middleware
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: 'File too large. Maximum size is 5MB.',
      code: 'FILE_TOO_LARGE'
    });
  }
  
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: 'File upload error: ' + err.message,
      code: 'UPLOAD_ERROR'
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}

// Apply error handling middleware
app.use(errorHandler);

// ====================
// Authentication Routes
// ====================

/**
 * @route GET /api/check-auth
 * @description Check if user is authenticated
 */
app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.teacherEmail) {
    res.json({ 
      success: true,
      authenticated: true,
      teacherEmail: req.session.teacherEmail,
      teacherName: req.session.teacherName,
      isAdmin: req.session.isAdmin || false
    });
  } else {
    res.json({ 
      success: true, 
      authenticated: false 
    });
  }
});

/**
 * @route POST /api/login
 * @description Teacher login
 */
app.post('/api/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const teachers = loadTeacherLogins();
    const teacher = teachers.get(email.toLowerCase());

    if (!teacher || teacher.password !== password) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Set session
    req.session.teacherEmail = teacher.email;
    req.session.teacherName = teacher.name;
    req.session.isAdmin = teacher.isAdmin || false;

    res.json({
      success: true,
      teacherEmail: teacher.email,
      teacherName: teacher.name,
      isAdmin: req.session.isAdmin
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during login',
      code: 'LOGIN_ERROR'
    });
  }
});

/**
 * @route POST /api/logout
 * @description Teacher logout
 */
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({
        success: false,
        error: 'Error logging out',
        code: 'LOGOUT_ERROR'
      });
    }
    res.clearCookie('homework.sid');
    res.json({ success: true });
  });
});

// ==================
// Homework Routes
// ==================

/**
 * @route GET /api/homework
 * @description Get all homeworks with optional filtering
 */
app.get('/api/homework', (req, res) => {
  try {
    let homeworks = loadHomeworks();
    const { 
      search, 
      subject, 
      status, 
      priority, 
      tag, 
      from, 
      to,
      yearGroup,
      teacherEmail,
      limit = 50,
      page = 1
    } = req.query;

    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase();
      homeworks = homeworks.filter(hw => 
        (hw.title && hw.title.toLowerCase().includes(searchLower)) ||
        (hw.description && hw.description.toLowerCase().includes(searchLower)) ||
        (hw.subject && hw.subject.toLowerCase().includes(searchLower))
      );
    }

    if (subject) {
      homeworks = homeworks.filter(hw => 
        hw.subject && hw.subject.toLowerCase() === subject.toLowerCase()
      );
    }

    if (status) {
      const isCompleted = status.toLowerCase() === 'completed';
      homeworks = homeworks.filter(hw => hw.completed === isCompleted);
    }

    if (priority) {
      homeworks = homeworks.filter(hw => 
        hw.priority && hw.priority.toLowerCase() === priority.toLowerCase()
      );
    }

    if (tag) {
      const tags = Array.isArray(tag) ? tag : [tag];
      homeworks = homeworks.filter(hw => 
        hw.tags && tags.some(t => hw.tags.includes(t))
      );
    }

    if (from) {
      const fromDate = new Date(from);
      homeworks = homeworks.filter(hw => 
        hw.dueDate && new Date(hw.dueDate) >= fromDate
      );
    }

    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999); // End of day
      homeworks = homeworks.filter(hw => 
        hw.dueDate && new Date(hw.dueDate) <= toDate
      );
    }

    if (yearGroup) {
      homeworks = homeworks.filter(hw => 
        hw.yearGroup && hw.yearGroup.toString() === yearGroup.toString()
      );
    }

    if (teacherEmail) {
      homeworks = homeworks.filter(hw => 
        hw.teacherEmail && hw.teacherEmail.toLowerCase() === teacherEmail.toLowerCase()
      );
    }

    // Sort by due date (ascending)
    homeworks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedHomeworks = homeworks.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedHomeworks,
      pagination: {
        total: homeworks.length,
        page: parseInt(page),
        totalPages: Math.ceil(homeworks.length / limit),
        hasNext: endIndex < homeworks.length,
        hasPrevious: startIndex > 0
      }
    });
  } catch (error) {
    console.error('Error getting homeworks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch homeworks',
      code: 'FETCH_ERROR'
    });
  }
});

/**
 * @route GET /api/homework/:id
 * @description Get a single homework by ID
 */
app.get('/api/homework/:id', (req, res) => {
  try {
    const homeworks = loadHomeworks();
    const homework = homeworks.find(h => h.id === req.params.id);
    
    if (!homework) {
      return res.status(404).json({
        success: false,
        error: 'Homework not found',
        code: 'NOT_FOUND'
      });
    }
    
    res.json({ success: true, data: homework });
  } catch (error) {
    console.error('Error getting homework:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch homework',
      code: 'FETCH_ERROR'
    });
  }
});

/**
 * @route POST /api/homework
 * @description Create a new homework
 */
app.post('/api/homework', requireTeacher, (req, res) => {
  try {
    const homeworks = loadHomeworks();
    const {
      title,
      subject,
      description,
      dueDate,
      priority = 'medium',
      tags = [],
      isRecurring = false,
      recurrence = { type: 'none', interval: 1, daysOfWeek: [] },
      yearGroup,
      className
    } = req.body;

    if (!title || !subject || !dueDate) {
      return res.status(400).json({
        success: false,
        error: 'Title, subject, and due date are required',
        code: 'VALIDATION_ERROR'
      });
    }

    const newHomework = {
      id: uuidv4(),
      title,
      subject,
      description: description || '',
      dueDate: new Date(dueDate).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: false,
      priority,
      tags: Array.isArray(tags) ? tags : [],
      attachments: [],
      teacherEmail: req.session.teacherEmail,
      teacherName: req.session.teacherName,
      yearGroup: yearGroup || null,
      className: className || null,
      isRecurring,
      recurrence: isRecurring ? {
        type: recurrence.type || 'none',
        interval: Math.max(1, parseInt(recurrence.interval) || 1),
        daysOfWeek: Array.isArray(recurrence.daysOfWeek) ? 
          recurrence.daysOfWeek.map(Number).filter(d => d >= 0 && d <= 6) : []
      } : { type: 'none', interval: 1, daysOfWeek: [] },
      nextOccurrence: null,
      parentId: null,
      comments: []
    };

    // Handle recurring homework
    if (isRecurring) {
      const createdHomeworks = [newHomework];
      
      // Generate occurrences based on recurrence pattern
      if (recurrence.type === 'daily' || recurrence.type === 'weekly') {
        const occurrences = 4; // Default number of occurrences
        const interval = recurrence.interval || 1;
        let currentDate = new Date(dueDate);
        
        for (let i = 1; i < occurrences; i++) {
          currentDate = new Date(currentDate);
          
          if (recurrence.type === 'daily') {
            currentDate.setDate(currentDate.getDate() + interval);
          } else if (recurrence.type === 'weekly') {
            // Find next valid day of week
            if (recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
              const currentDay = currentDate.getDay();
              const nextDay = recurrence.daysOfWeek.find(d => d > currentDay) || 
                             recurrence.daysOfWeek[0] + 7;
              const daysToAdd = nextDay - currentDay + (nextDay <= currentDay ? 7 : 0);
              currentDate.setDate(currentDate.getDate() + daysToAdd);
            } else {
              currentDate.setDate(currentDate.getDate() + (7 * interval));
            }
          }
          
          const occurrence = {
            ...newHomework,
            id: uuidv4(),
            dueDate: currentDate.toISOString(),
            parentId: newHomework.id,
            nextOccurrence: null
          };
          
          createdHomeworks.push(occurrence);
        }
        
        // Update next occurrence for the first item
        if (createdHomeworks.length > 1) {
          createdHomeworks[0].nextOccurrence = createdHomeworks[1].dueDate;
        }
      }
      
      // Save all created homeworks
      homeworks.push(...createdHomeworks);
    } else {
      homeworks.push(newHomework);
    }
    
    if (!saveHomeworks(homeworks)) {
      throw new Error('Failed to save homework');
    }
    
    res.status(201).json({
      success: true,
      message: 'Homework created successfully',
      data: newHomework
    });
  } catch (error) {
    console.error('Error creating homework:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create homework',
      code: 'CREATE_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route PUT /api/homework/:id
 * @description Update a homework
 */
app.put('/api/homework/:id', requireTeacher, checkHomeworkPermission, (req, res) => {
  try {
    const homeworks = loadHomeworks();
    const index = homeworks.findIndex(h => h.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Homework not found',
        code: 'NOT_FOUND'
      });
    }
    
    const updatedHomework = {
      ...homeworks[index],
      ...req.body,
      id: req.params.id, // Prevent ID change
      updatedAt: new Date().toISOString()
    };
    
    homeworks[index] = updatedHomework;
    
    if (!saveHomeworks(homeworks)) {
      throw new Error('Failed to update homework');
    }
    
    res.json({
      success: true,
      message: 'Homework updated successfully',
      data: updatedHomework
    });
  } catch (error) {
    console.error('Error updating homework:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update homework',
      code: 'UPDATE_ERROR'
    });
  }
});

/**
 * @route DELETE /api/homework/:id
 * @description Delete a homework
 */
app.delete('/api/homework/:id', requireTeacher, checkHomeworkPermission, (req, res) => {
  try {
    let homeworks = loadHomeworks();
    const index = homeworks.findIndex(h => h.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Homework not found',
        code: 'NOT_FOUND'
      });
    }
    
    // If it's a recurring homework, delete all occurrences
    const homeworkToDelete = homeworks[index];
    if (homeworkToDelete.isRecurring) {
      homeworks = homeworks.filter(h => 
        h.id !== req.params.id && h.parentId !== homeworkToDelete.parentId
      );
    } else {
      homeworks = homeworks.filter(h => h.id !== req.params.id);
    }
    
    if (!saveHomeworks(homeworks)) {
      throw new Error('Failed to delete homework');
    }
    
    res.json({
      success: true,
      message: 'Homework deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting homework:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete homework',
      code: 'DELETE_ERROR'
    });
  }
});

/**
 * @route POST /api/homework/:id/complete
 * @description Toggle homework completion status
 */
app.post('/api/homework/:id/complete', requireTeacher, checkHomeworkPermission, (req, res) => {
  try {
    const homeworks = loadHomeworks();
    const index = homeworks.findIndex(h => h.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Homework not found',
        code: 'NOT_FOUND'
      });
    }
    
    const updatedHomework = {
      ...homeworks[index],
      completed: !homeworks[index].completed,
      updatedAt: new Date().toISOString()
    };
    
    homeworks[index] = updatedHomework;
    
    if (!saveHomeworks(homeworks)) {
      throw new Error('Failed to update homework status');
    }
    
    res.json({
      success: true,
      message: `Homework marked as ${updatedHomework.completed ? 'completed' : 'incomplete'}`,
      data: updatedHomework
    });
  } catch (error) {
    console.error('Error toggling homework status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update homework status',
      code: 'UPDATE_ERROR'
    });
  }
});

// ==================
// Bulk Operations
// ==================

/**
 * @route POST /api/homework/bulk-delete
 * @description Delete multiple homeworks
 */
app.post('/api/homework/bulk-delete', requireTeacher, (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No homework IDs provided',
        code: 'VALIDATION_ERROR'
      });
    }
    
    let homeworks = loadHomeworks();
    const initialCount = homeworks.length;
    
    // Only allow deleting homeworks owned by the teacher
    homeworks = homeworks.filter(hw => 
      !ids.includes(hw.id) || 
      hw.teacherEmail !== req.session.teacherEmail
    );
    
    const deletedCount = initialCount - homeworks.length;
    
    if (!saveHomeworks(homeworks)) {
      throw new Error('Failed to delete homeworks');
    }
    
    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} homeworks`,
      count: deletedCount
    });
  } catch (error) {
    console.error('Error in bulk delete:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete homeworks',
      code: 'BULK_DELETE_ERROR'
    });
  }
});

/**
 * @route POST /api/homework/bulk-update
 * @description Update multiple homeworks
 */
app.post('/api/homework/bulk-update', requireTeacher, (req, res) => {
  try {
    const { ids, updates } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0 || !updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        code: 'VALIDATION_ERROR'
      });
    }
    
    const homeworks = loadHomeworks();
    let updatedCount = 0;
    
    const updatedHomeworks = homeworks.map(hw => {
      if (ids.includes(hw.id) && hw.teacherEmail === req.session.teacherEmail) {
        updatedCount++;
        return {
          ...hw,
          ...updates,
          updatedAt: new Date().toISOString()
        };
      }
      return hw;
    });
    
    if (updatedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'No matching homeworks found or no permission',
        code: 'NOT_FOUND'
      });
    }
    
    if (!saveHomeworks(updatedHomeworks)) {
      throw new Error('Failed to update homeworks');
    }
    
    res.json({
      success: true,
      message: `Successfully updated ${updatedCount} homeworks`,
      count: updatedCount
    });
  } catch (error) {
    console.error('Error in bulk update:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update homeworks',
      code: 'BULK_UPDATE_ERROR'
    });
  }
});

// ==================
// Comments & Notes
// ==================

/**
 * @route GET /api/homework/:id/comments
 * @description Get comments for a homework
 */
app.get('/api/homework/:id/comments', requireTeacher, (req, res) => {
  try {
    const homeworks = loadHomeworks();
    const homework = homeworks.find(h => h.id === req.params.id);
    
    if (!homework) {
      return res.status(404).json({
        success: false,
        error: 'Homework not found',
        code: 'NOT_FOUND'
      });
    }
    
    res.json({
      success: true,
      data: homework.comments || []
    });
  } catch (error) {
    console.error('Error getting comments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch comments',
      code: 'FETCH_ERROR'
    });
  }
});

/**
 * @route POST /api/homework/:id/comments
 * @description Add a comment to a homework
 */
app.post('/api/homework/:id/comments', requireTeacher, (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Comment content is required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    const homeworks = loadHomeworks();
    const index = homeworks.findIndex(h => h.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Homework not found',
        code: 'NOT_FOUND'
      });
    }
    
    const newComment = {
      id: uuidv4(),
      content: content.trim(),
      author: req.session.teacherEmail,
      authorName: req.session.teacherName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    if (!homeworks[index].comments) {
      homeworks[index].comments = [];
    }
    
    homeworks[index].comments.push(newComment);
    homeworks[index].updatedAt = new Date().toISOString();
    
    if (!saveHomeworks(homeworks)) {
      throw new Error('Failed to save comment');
    }
    
    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: newComment
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comment',
      code: 'CREATE_ERROR'
    });
  }
});

// ==================
// File Attachments
// ==================

/**
 * @route POST /api/homework/:id/attachments
 * @description Upload a file attachment for a homework
 */
app.post(
  '/api/homework/:id/attachments',
  requireTeacher,
  upload.single('file'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
          code: 'NO_FILE'
        });
      }
      
      const homeworks = loadHomeworks();
      const index = homeworks.findIndex(h => h.id === req.params.id);
      
      if (index === -1) {
        // Clean up the uploaded file if homework not found
        fs.unlinkSync(req.file.path);
        
        return res.status(404).json({
          success: false,
          error: 'Homework not found',
          code: 'NOT_FOUND'
        });
      }
      
      const attachment = {
        id: uuidv4(),
        filename: req.file.originalname,
        path: `/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedBy: req.session.teacherEmail,
        uploadedAt: new Date().toISOString()
      };
      
      if (!homeworks[index].attachments) {
        homeworks[index].attachments = [];
      }
      
      homeworks[index].attachments.push(attachment);
      homeworks[index].updatedAt = new Date().toISOString();
      
      if (!saveHomeworks(homeworks)) {
        // Clean up the uploaded file if save fails
        fs.unlinkSync(req.file.path);
        throw new Error('Failed to save attachment');
      }
      
      res.status(201).json({
        success: true,
        message: 'File uploaded successfully',
        data: attachment
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      
      // Clean up the uploaded file if there was an error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to upload file',
        code: 'UPLOAD_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route DELETE /api/homework/:homeworkId/attachments/:attachmentId
 * @description Delete a file attachment
 */
app.delete(
  '/api/homework/:homeworkId/attachments/:attachmentId',
  requireTeacher,
  (req, res) => {
    try {
      const { homeworkId, attachmentId } = req.params;
      
      const homeworks = loadHomeworks();
      const index = homeworks.findIndex(h => h.id === homeworkId);
      
      if (index === -1) {
        return res.status(404).json({
          success: false,
          error: 'Homework not found',
          code: 'NOT_FOUND'
        });
      }
      
      if (!homeworks[index].attachments || !Array.isArray(homeworks[index].attachments)) {
        return res.status(404).json({
          success: false,
          error: 'No attachments found',
          code: 'NOT_FOUND'
        });
      }
      
      const attachmentIndex = homeworks[index].attachments.findIndex(
        a => a.id === attachmentId
      );
      
      if (attachmentIndex === -1) {
        return res.status(404).json({
          success: false,
          error: 'Attachment not found',
          code: 'NOT_FOUND'
        });
      }
      
      // Get the file path before removing the attachment
      const filePath = path.join(__dirname, homeworks[index].attachments[attachmentIndex].path);
      
      // Remove the attachment from the array
      homeworks[index].attachments.splice(attachmentIndex, 1);
      homeworks[index].updatedAt = new Date().toISOString();
      
      if (!saveHomeworks(homeworks)) {
        throw new Error('Failed to update homework');
      }
      
      // Delete the actual file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      res.json({
        success: true,
        message: 'Attachment deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting attachment:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete attachment',
        code: 'DELETE_ERROR'
      });
    }
  }
);

// ==================
// Templates
// ==================

/**
 * @route GET /api/templates
 * @description Get all homework templates
 */
app.get('/api/templates', requireTeacher, (req, res) => {
  try {
    const templates = loadTemplates();
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error getting templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
      code: 'FETCH_ERROR'
    });
  }
});

/**
 * @route POST /api/templates
 * @description Create a new homework template
 */
app.post('/api/templates', requireTeacher, (req, res) => {
  try {
    const { title, subject, description, tags = [] } = req.body;
    
    if (!title || !subject) {
      return res.status(400).json({
        success: false,
        error: 'Title and subject are required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    const templates = loadTemplates();
    const newTemplate = {
      id: uuidv4(),
      title,
      subject,
      description: description || '',
      tags: Array.isArray(tags) ? tags : [],
      createdAt: new Date().toISOString(),
      createdBy: req.session.teacherEmail,
      updatedAt: new Date().toISOString()
    };
    
    templates.push(newTemplate);
    saveTemplates(templates);
    
    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      data: newTemplate
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create template',
      code: 'CREATE_ERROR'
    });
  }
});

// ==================
// Statistics
// ==================

/**
 * @route GET /api/stats
 * @description Get homework statistics
 */
app.get('/api/stats', requireTeacher, (req, res) => {
  try {
    const homeworks = loadHomeworks();
    const teacherEmail = req.session.teacherEmail;
    
    // Filter homeworks for the current teacher
    const teacherHomeworks = homeworks.filter(hw => hw.teacherEmail === teacherEmail);
    
    // Calculate statistics
    const total = teacherHomeworks.length;
    const completed = teacherHomeworks.filter(hw => hw.completed).length;
    const pending = total - completed;
    
    // Group by subject
    const bySubject = {};
    teacherHomeworks.forEach(hw => {
      const subject = hw.subject || 'Uncategorized';
      bySubject[subject] = (bySubject[subject] || 0) + 1;
    });
    
    // Group by priority
    const byPriority = {
      high: teacherHomeworks.filter(hw => hw.priority === 'high').length,
      medium: teacherHomeworks.filter(hw => hw.priority === 'medium').length,
      low: teacherHomeworks.filter(hw => hw.priority === 'low').length
    };
    
    // Group by due date (this week, next week, later)
    const now = new Date();
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(now.getDate() + 7);
    
    const byDueDate = {
      overdue: teacherHomeworks.filter(hw => 
        !hw.completed && new Date(hw.dueDate) < now
      ).length,
      thisWeek: teacherHomeworks.filter(hw => 
        !hw.completed && 
        new Date(hw.dueDate) >= now && 
        new Date(hw.dueDate) <= oneWeekFromNow
      ).length,
      later: teacherHomeworks.filter(hw => 
        !hw.completed && 
        new Date(hw.dueDate) > oneWeekFromNow
      ).length
    };
    
    res.json({
      success: true,
      data: {
        total,
        completed,
        pending,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        bySubject,
        byPriority,
        byDueDate
      }
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      code: 'STATS_ERROR'
    });
  }
});

// ==================
// Export/Import
// ==================

/**
 * @route GET /api/export
 * @description Export all homeworks as JSON
 */
app.get('/api/export', requireTeacher, (req, res) => {
  try {
    const homeworks = loadHomeworks();
    const teacherEmail = req.session.teacherEmail;
    
    // Filter homeworks for the current teacher
    const teacherHomeworks = homeworks.filter(hw => hw.teacherEmail === teacherEmail);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=homework-export-${new Date().toISOString().split('T')[0]}.json`);
    
    // Send the JSON data
    res.send(JSON.stringify(teacherHomeworks, null, 2));
  } catch (error) {
    console.error('Error exporting homeworks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export homeworks',
      code: 'EXPORT_ERROR'
    });
  }
});

/**
 * @route POST /api/import
 * @description Import homeworks from JSON
 */
app.post('/api/import', requireTeacher, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        code: 'NO_FILE'
      });
    }
    
    // Read and parse the uploaded file
    const fileContent = fs.readFileSync(req.file.path, 'utf8');
    const importedHomeworks = JSON.parse(fileContent);
    
    if (!Array.isArray(importedHomeworks)) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(400).json({
        success: false,
        error: 'Invalid file format. Expected an array of homeworks.',
        code: 'INVALID_FORMAT'
      });
    }
    
    const homeworks = loadHomeworks();
    const teacherEmail = req.session.teacherEmail;
    let importedCount = 0;
    
    // Process each imported homework
    importedHomeworks.forEach(hw => {
      // Skip if required fields are missing
      if (!hw.title || !hw.subject || !hw.dueDate) {
        return;
      }
      
      // Create a new homework with the imported data
      const newHomework = {
        id: uuidv4(),
        title: hw.title,
        subject: hw.subject,
        description: hw.description || '',
        dueDate: hw.dueDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completed: hw.completed || false,
        priority: hw.priority || 'medium',
        tags: Array.isArray(hw.tags) ? hw.tags : [],
        attachments: [], // Don't import attachments
        teacherEmail,
        teacherName: req.session.teacherName,
        yearGroup: hw.yearGroup || null,
        className: hw.className || null,
        isRecurring: hw.isRecurring || false,
        recurrence: hw.recurrence || { type: 'none', interval: 1, daysOfWeek: [] },
        nextOccurrence: hw.nextOccurrence || null,
        parentId: null, // Reset parent ID for imported items
        comments: [] // Don't import comments
      };
      
      homeworks.push(newHomework);
      importedCount++;
    });
    
    // Save the updated homeworks
    if (!saveHomeworks(homeworks)) {
      throw new Error('Failed to save imported homeworks');
    }
    
    // Clean up the uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      message: `Successfully imported ${importedCount} homeworks`,
      count: importedCount,
      total: importedHomeworks.length
    });
  } catch (error) {
    console.error('Error importing homeworks:', error);
    
    // Clean up the uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to import homeworks',
      code: 'IMPORT_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================
// Email Notifications
// ==================

/**
 * @route POST /api/notify
 * @description Send email notifications for upcoming homeworks
 */
app.post('/api/notify', requireTeacher, async (req, res) => {
  try {
    const { daysAhead = 1, recipientEmail } = req.body;
    
    if (!recipientEmail || !/\S+@\S+\.\S+/.test(recipientEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Valid recipient email is required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    const homeworks = loadHomeworks();
    const teacherEmail = req.session.teacherEmail;
    const now = new Date();
    const targetDate = new Date();
    targetDate.setDate(now.getDate() + parseInt(daysAhead));
    
    // Find homeworks due on the target date
    const upcomingHomeworks = homeworks.filter(hw => {
      if (hw.teacherEmail !== teacherEmail || hw.completed) {
        return false;
      }
      
      const dueDate = new Date(hw.dueDate);
      return (
        dueDate.getDate() === targetDate.getDate() &&
        dueDate.getMonth() === targetDate.getMonth() &&
        dueDate.getFullYear() === targetDate.getFullYear()
      );
    });
    
    if (upcomingHomeworks.length === 0) {
      return res.json({
        success: true,
        message: 'No upcoming homeworks found for notification',
        count: 0
      });
    }
    
    // Prepare email content
    const emailHtml = `
      <h2>Upcoming Homeworks - ${targetDate.toDateString()}</h2>
      <p>You have ${upcomingHomeworks.length} homeworks due soon:</p>
      <ul>
        ${upcomingHomeworks.map(hw => `
          <li>
            <strong>${hw.title}</strong> (${hw.subject})
            <br>Due: ${new Date(hw.dueDate).toLocaleString()}
            ${hw.priority ? `<br>Priority: ${hw.priority}` : ''}
            ${hw.description ? `<p>${hw.description}</p>` : ''}
          </li>
        `).join('')}
      </ul>
      <p>Log in to your homework planner for more details.</p>
    `;
    
    // Send email
    await transporter.sendMail({
      from: `"Homework Planner" <${process.env.EMAIL_FROM || 'noreply@example.com'}>`,
      to: recipientEmail,
      subject: `Upcoming Homeworks - ${targetDate.toDateString()}`,
      html: emailHtml,
      text: emailHtml.replace(/<[^>]*>/g, '') // Plain text version
    });
    
    res.json({
      success: true,
      message: `Notification sent successfully to ${recipientEmail}`,
      count: upcomingHomeworks.length
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification',
      code: 'NOTIFICATION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================
// Start the server
// ==================

// Fallback: send index.html for any other GET (SPA-style)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // In production, you might want to restart the process here
  // process.exit(1);
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Homework planner running on port ${PORT}`);
  console.log(`Access it at: http://localhost:${PORT}`);
})};
