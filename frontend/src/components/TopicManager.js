import React, { useEffect, useState } from 'react';
import {
  fetchTopics,
  createTopic,
  updateTopic,
  deleteTopic
} from '../services/api';

function TopicManager() {
  const [topics, setTopics] = useState([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  const loadTopics = async () => {
    try {
      const data = await fetchTopics();
      setTopics(data);
    } catch (error) {
      setMessage('Failed to load topics');
    }
  };

  useEffect(() => {
    loadTopics();
  }, []);

  const resetForm = () => {
    setName('');
    setSlug('');
    setDescription('');
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name || !slug || !description) {
      setMessage('Please fill all fields');
      return;
    }

    const topicData = {
      name,
      slug,
      description
    };

    try {
      if (editingId) {
        await updateTopic(editingId, topicData);
        setMessage('Topic updated successfully');
      } else {
        await createTopic(topicData);
        setMessage('Topic added successfully');
      }

      resetForm();
      loadTopics();
    } catch (error) {
      setMessage('Failed to save topic');
    }
  };

  const handleEdit = (topic) => {
    setEditingId(topic.id);
    setName(topic.name);
    setSlug(topic.slug);
    setDescription(topic.description);
    setMessage('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this topic?')) {
      return;
    }

    try {
      await deleteTopic(id);
      setMessage('Topic deleted successfully');
      loadTopics();
    } catch (error) {
      setMessage('Failed to delete topic');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">
        Topic Management
      </h1>

      <div className="bg-white shadow-md rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-4">
          {editingId ? 'Edit Topic' : 'Add New Topic'}
        </h2>

        {message && (
          <div className="mb-4 p-3 bg-gray-100 rounded">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          <div className="mb-4">
            <label className="block mb-2 font-medium">
              Topic Name:
            </label>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Docker"
              className="w-full border rounded p-2"
            />
          </div>

          <div className="mb-4">
            <label className="block mb-2 font-medium">
              Topic Slug:
            </label>

            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="docker"
              className="w-full border rounded p-2"
            />

            <p className="text-sm text-gray-500 mt-1">
              Example: docker, kubernetes, aws
            </p>
          </div>

          <div className="mb-4">
            <label className="block mb-2 font-medium">
              Description:
            </label>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Learn Docker containers, images and networking"
              className="w-full border rounded p-2"
              rows="4"
            />
          </div>

          <button
            type="submit"
            className="bg-blue-500 text-white px-5 py-2 rounded hover:bg-blue-600"
          >
            {editingId ? 'Update Topic' : 'Add Topic'}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="ml-3 bg-gray-500 text-white px-5 py-2 rounded"
            >
              Cancel
            </button>
          )}

        </form>
      </div>

      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">
          Existing Topics
        </h2>

        {topics.length === 0 ? (
          <p>No topics available.</p>
        ) : (
          <div className="space-y-4">

            {topics.map((topic) => (
              <div
                key={topic.id}
                className="border rounded p-4 flex justify-between items-center"
              >

                <div>
                  <h3 className="text-xl font-semibold">
                    {topic.name}
                  </h3>

                  <p className="text-sm text-gray-500">
                    Slug: {topic.slug}
                  </p>

                  <p className="mt-1">
                    {topic.description}
                  </p>
                </div>

                <div>
                  <button
                    onClick={() => handleEdit(topic)}
                    className="bg-yellow-500 text-white px-3 py-2 rounded mr-2"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => handleDelete(topic.id)}
                    className="bg-red-500 text-white px-3 py-2 rounded"
                  >
                    Delete
                  </button>
                </div>

              </div>
            ))}

          </div>
        )}
      </div>
    </div>
  );
}

export default TopicManager;
