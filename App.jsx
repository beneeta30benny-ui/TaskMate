
import { useEffect, useState } from 'react';
import './App.css';

const API_URL = '/api/tasks';

async function requestApi(url, options) {
  const response = await fetch(url, options);
  const responseText = await response.text();
  const contentType = response.headers.get('content-type') || '';
  let data = null;

  if (responseText) {
    if (!contentType.includes('application/json')) {
      throw new Error(
        `The API returned a non-JSON response (HTTP ${response.status}). ` +
        'Check that the backend is running from the project server folder.'
      );
    }

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error('The API returned invalid JSON.');
    }
  }

  if (!response.ok) {
    throw new Error(data?.message || `Request failed (HTTP ${response.status})`);
  }

  return data;
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadTasks() {
    try {
      const data = await requestApi(API_URL);
      setTasks(data);
    } catch (err) {
      setError(err.message || 'Could not connect to the backend.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isCurrent = true;

    requestApi(API_URL)
      .then(data => {
        if (isCurrent) setTasks(data);
      })
      .catch(err => {
        if (isCurrent) {
          setError(err.message || 'Could not connect to the backend.');
        }
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  function resetForm() {
    setTitle('');
    setDescription('');
    setPriority('Medium');
    setDueDate('');
    setEditingId(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!title.trim()) {
      setError('Please enter a task title.');
      return;
    }

    const taskData = {
      title: title.trim(),
      description: description.trim(),
      priority,
      dueDate: dueDate || null
    };

    try {
      setError('');
      await requestApi(
        editingId ? `${API_URL}/${editingId}` : API_URL,
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskData)
        }
      );

      resetForm();
      await loadTasks();
    } catch (err) {
      setError(err.message || 'Could not save task.');
    }
  }

  async function toggleTask(task) {
    try {
      setError('');
      await requestApi(`${API_URL}/${task._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !task.completed })
      });

      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditing(task) {
    setEditingId(task._id);
    setTitle(task.title);
    setDescription(task.description || '');
    setPriority(task.priority || 'Medium');
    setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteTask(id) {
    if (!window.confirm('Are you sure you want to delete this task?')) return;

    try {
      setError('');
      await requestApi(`${API_URL}/${id}`, {
        method: 'DELETE'
      });

      await loadTasks();
      if (editingId === id) resetForm();
    } catch (err) {
      setError(err.message);
    }
  }

  const completedCount = tasks.filter(task => task.completed).length;
  const pendingCount = tasks.length - completedCount;
  const progress = tasks.length
    ? Math.round((completedCount / tasks.length) * 100)
    : 0;

  const visibleTasks = tasks.filter(task => {
    const matchesFilter =
      filter === 'All' ||
      (filter === 'Pending' && !task.completed) ||
      (filter === 'Completed' && task.completed);
    const searchText = `${task.title} ${task.description || ''}`.toLowerCase();

    return matchesFilter && searchText.includes(search.trim().toLowerCase());
  });

  return (
    <main className="app">
      <header className="header">
        <h1>✓ TaskMate</h1>
        <p>Your daily task management dashboard</p>
      </header>

      <section className="stats">
        <div><h3>Total tasks</h3><p>{tasks.length}</p></div>
        <div><h3>Pending</h3><p>{pendingCount}</p></div>
        <div><h3>Completed</h3><p>{completedCount}</p></div>
      </section>

      <section className="form-card">
        <h2>{editingId ? 'Edit task' : 'Add a new task'}</h2>

        <form onSubmit={handleSubmit}>
          <label>Task title *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Enter task title"
            required
          />

          <label>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe your task"
          />

          <div className="form-row">
            <div>
              <label>Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </div>

            <div>
              <label>Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit">
              {editingId ? 'Save changes' : '+ Add task'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="task-section">
        <h2>Your tasks</h2>

        <div className="filters">
          {['All', 'Pending', 'Completed'].map(option => (
            <button
              key={option}
              className={filter === option ? 'active' : ''}
              onClick={() => setFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <input
          className="task-search"
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search tasks"
          aria-label="Search tasks"
        />

        <p>Progress: {progress}%</p>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {loading ? (
          <p>Loading tasks...</p>
        ) : visibleTasks.length === 0 ? (
          <p>No tasks here yet. Add your first task above!</p>
        ) : (
          <div className="task-list">
            {visibleTasks.map(task => (
              <article className="task-card" key={task._id}>
                <div className="task-heading">
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleTask(task)}
                    />
                    <span className={task.completed ? 'done' : ''}>
                      {task.title}
                    </span>
                  </label>
                  <span className={`priority ${task.priority.toLowerCase()}`}>
                    {task.priority}
                  </span>
                </div>

                {task.description && <p>{task.description}</p>}
                {task.dueDate && (
                  <p>Due: {task.dueDate.slice(0, 10)}</p>
                )}

                <div className="task-actions">
                  <button onClick={() => startEditing(task)}>Edit</button>
                  <button onClick={() => deleteTask(task._id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
