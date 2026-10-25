const path = require('node:path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Task = require('./models/Task');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const editableTaskFields = ['title', 'description', 'priority', 'dueDate', 'completed'];

app.use(cors());
app.use(express.json());

app.use('/api', (req, res, next) => {
  if (
    ['POST', 'PUT'].includes(req.method) &&
    (!req.is('application/json') ||
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body))
  ) {
    return res.status(400).json({ message: 'Expected a JSON request body' });
  }

  next();
});

app.get('/api/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? 'ok' : 'unavailable',
    database: databaseConnected ? 'connected' : 'disconnected'
  });
});

app.get('/api/tasks', async (req, res, next) => {
  try {
    const tasks = await Task.find().sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

app.post('/api/tasks', async (req, res, next) => {
  try {
    const task = await Task.create({
      title: req.body.title,
      description: req.body.description,
      priority: req.body.priority,
      dueDate: req.body.dueDate || null
    });

    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

app.put('/api/tasks/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }

  const updates = Object.fromEntries(
    editableTaskFields
      .filter(field => Object.hasOwn(req.body, field))
      .map(field => [field, req.body[field]])
  );

  if (Object.hasOwn(updates, 'dueDate') && !updates.dueDate) {
    updates.dueDate = null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No valid task fields to update' });
  }

  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      updates,
      { returnDocument: 'after', runValidators: true }
    );

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/tasks/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }

  try {
    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    next(error);
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status =
    error.status ||
    error.statusCode ||
    (['ValidationError', 'CastError'].includes(error.name) ? 400 : 500);
  if (status >= 500) {
    console.error('TaskMate API request failed:', error.message);
  }

  res.status(status).json({
    message: status >= 500 ? 'An unexpected server error occurred' : error.message
  });
});

async function startServer() {
  if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
    throw new Error('PORT must be a valid TCP port number');
  }

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected successfully.');

  const server = app.listen(PORT, () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : PORT;
    console.log(`TaskMate backend entry point: ${__filename}`);
    console.log(`TaskMate backend listening at http://localhost:${port}`);
  });

  server.on('error', error => {
    console.error(`TaskMate backend could not listen on port ${PORT}:`, error.message);
    process.exitCode = 1;
  });
}

if (require.main === module) {
  startServer().catch(error => {
    console.error('TaskMate backend failed to start:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
