const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const { app } = require('../server.js');

test('Task model defines the expected fields and timestamps', async () => {
  const task = new Task({ title: 'Review submission', priority: 'High' });

  await task.validate();

  for (const field of ['title', 'description', 'priority', 'dueDate', 'completed']) {
    assert.ok(Task.schema.path(field), `expected ${field} schema path`);
  }

  assert.equal(Task.schema.options.timestamps, true);
  assert.equal(task.completed, false);
  assert.equal(task.description, '');
  assert.equal(task.priority, 'High');
  assert.equal(task.dueDate, null);
  assert.equal(mongoose.connection.readyState, 0);
});

test('API returns JSON health, route errors, and task CRUD responses', async t => {
  let savedTask = null;
  const taskId = '507f1f77bcf86cd799439011';
  const originals = {
    find: Task.find,
    create: Task.create,
    findByIdAndUpdate: Task.findByIdAndUpdate,
    findByIdAndDelete: Task.findByIdAndDelete
  };

  Task.find = () => ({
    sort: async sort => {
      assert.deepEqual(sort, { createdAt: -1 });
      return savedTask ? [savedTask] : [];
    }
  });
  Task.create = async fields => {
    const task = new Task(fields);
    await task.validate();
    savedTask = { _id: taskId, ...task.toObject() };
    return savedTask;
  };
  Task.findByIdAndUpdate = async (id, updates, options) => {
    assert.equal(id, taskId);
    assert.deepEqual(options, { returnDocument: 'after', runValidators: true });
    savedTask = { ...savedTask, ...updates };
    return savedTask;
  };
  Task.findByIdAndDelete = async id => {
    assert.equal(id, taskId);
    const deleted = savedTask;
    savedTask = null;
    return deleted;
  };

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(async () => {
    Object.assign(Task, originals);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 503);
  assert.match(healthResponse.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await healthResponse.json(), {
    status: 'unavailable',
    database: 'disconnected'
  });

  const missingRouteResponse = await fetch(`${baseUrl}/api/not-a-route`);
  assert.equal(missingRouteResponse.status, 404);
  assert.match(missingRouteResponse.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await missingRouteResponse.json(), { message: 'API route not found' });

  const initialTasksResponse = await fetch(`${baseUrl}/api/tasks`);
  assert.deepEqual(await initialTasksResponse.json(), []);

  const invalidCreateResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '' })
  });
  assert.equal(invalidCreateResponse.status, 400);
  assert.match(invalidCreateResponse.headers.get('content-type'), /application\/json/);

  const createResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Review submission',
      description: 'Verify the API',
      priority: 'High',
      dueDate: null
    })
  });
  assert.equal(createResponse.status, 201);
  assert.equal((await createResponse.json()).title, 'Review submission');

  const listedTasksResponse = await fetch(`${baseUrl}/api/tasks`);
  assert.equal((await listedTasksResponse.json()).length, 1);

  const updateResponse = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: true, ignored: 'not editable' })
  });
  assert.equal(updateResponse.status, 200);
  const updatedTask = await updateResponse.json();
  assert.equal(updatedTask.completed, true);
  assert.equal(Object.hasOwn(updatedTask, 'ignored'), false);

  const invalidIdResponse = await fetch(`${baseUrl}/api/tasks/not-an-id`, {
    method: 'DELETE'
  });
  assert.equal(invalidIdResponse.status, 400);
  assert.match(invalidIdResponse.headers.get('content-type'), /application\/json/);

  const deleteResponse = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
    method: 'DELETE'
  });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), {
    message: 'Task deleted successfully'
  });

  const malformedJsonResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"title":'
  });
  assert.equal(malformedJsonResponse.status, 400);
  assert.match(malformedJsonResponse.headers.get('content-type'), /application\/json/);
});
