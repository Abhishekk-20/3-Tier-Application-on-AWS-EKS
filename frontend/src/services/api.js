// src/services/api.js
import API_URL from '../config/api';

export const fetchTopics = async () => {
  try {
    const response = await fetch(`${API_URL}/topics`);
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching topics:', error);
    throw error;
  }
};

// Add other API calls as needed
export const createTopic = async (topicData) => {
  try {
    const response = await fetch(`${API_URL}/topics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(topicData),
    });
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating topic:', error);
    throw error;
  }
};

// UPDATE TOPIC
export const updateTopic = async (id, topicData) => {
  try {
    const response = await fetch(`${API_URL}/topics/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(topicData),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    console.error('Error updating topic:', error);
    throw error;
  }
};



// DELETE TOPIC
export const deleteTopic = async (id) => {
  try {
    const response = await fetch(`${API_URL}/topics/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    return true;

  } catch (error) {
    console.error('Error deleting topic:', error);
    throw error;
  }
};
