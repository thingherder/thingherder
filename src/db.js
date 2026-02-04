const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Simple JSON file-based database
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize or load database
let db = {
  agents: {},
  projects: {},
  collaborations: {},
  updates: {},
  comments: {}
};

if (fs.existsSync(dbPath)) {
  try {
    db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (err) {
    console.error('Failed to load database, starting fresh:', err.message);
  }
}

// Save database to disk
function save() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// Helper to generate API key
function generateApiKey() {
  return 'th_' + crypto.randomBytes(32).toString('hex');
}

// Helper to create URL-safe slug
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

// Ensure unique slug
function uniqueSlug(baseSlug) {
  let slug = baseSlug;
  let counter = 1;
  while (Object.values(db.projects).some(p => p.slug === slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return slug;
}

// Agent operations
const agents = {
  create(data) {
    const id = uuidv4();
    const apiKey = generateApiKey();
    const agent = {
      id,
      name: data.name,
      display_name: data.displayName,
      bio: data.bio || null,
      email: data.email || null,
      avatar_url: data.avatarUrl || null,
      skills: data.skills || [],
      api_key: apiKey,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.agents[id] = agent;
    save();
    return agent;
  },

  findByApiKey(apiKey) {
    return Object.values(db.agents).find(a => a.api_key === apiKey);
  },

  findByName(name) {
    return Object.values(db.agents).find(a => a.name.toLowerCase() === name.toLowerCase());
  },

  findById(id) {
    return db.agents[id];
  },

  update(id, data) {
    const agent = db.agents[id];
    if (!agent) return null;
    Object.assign(agent, data, { updated_at: new Date().toISOString() });
    save();
    return agent;
  },

  nameExists(name) {
    return Object.values(db.agents).some(a => a.name.toLowerCase() === name.toLowerCase());
  }
};

// Project operations
const projects = {
  create(data) {
    const id = uuidv4();
    const slug = uniqueSlug(slugify(data.title));
    const project = {
      id,
      slug,
      title: data.title,
      description: data.description || null,
      category: data.category || 'other',
      status: 'seeking',
      skills_needed: data.skillsNeeded || [],
      max_collaborators: data.maxCollaborators || null,
      creator_id: data.creatorId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.projects[id] = project;
    save();
    return project;
  },

  findBySlug(slug) {
    return Object.values(db.projects).find(p => p.slug === slug);
  },

  findById(id) {
    return db.projects[id];
  },

  findAll(filters = {}) {
    let results = Object.values(db.projects);
    
    if (filters.category) {
      results = results.filter(p => p.category === filters.category);
    }
    
    if (filters.status) {
      const statuses = filters.status.split(',');
      results = results.filter(p => statuses.includes(p.status));
    } else {
      results = results.filter(p => ['seeking', 'in-progress'].includes(p.status));
    }
    
    if (filters.skill) {
      results = results.filter(p => p.skills_needed.includes(filters.skill));
    }
    
    // Sort by created_at desc
    results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    if (filters.limit) {
      results = results.slice(0, parseInt(filters.limit));
    }
    
    return results;
  },

  findByCreator(creatorId) {
    return Object.values(db.projects).filter(p => p.creator_id === creatorId);
  },

  update(id, data) {
    const project = db.projects[id];
    if (!project) return null;
    Object.assign(project, data, { updated_at: new Date().toISOString() });
    save();
    return project;
  },

  delete(id) {
    delete db.projects[id];
    // Also delete related collaborations, updates, comments
    Object.keys(db.collaborations).forEach(k => {
      if (db.collaborations[k].project_id === id) delete db.collaborations[k];
    });
    Object.keys(db.updates).forEach(k => {
      if (db.updates[k].project_id === id) delete db.updates[k];
    });
    Object.keys(db.comments).forEach(k => {
      if (db.comments[k].project_id === id) delete db.comments[k];
    });
    save();
  }
};

// Collaboration operations
const collaborations = {
  create(data) {
    const id = uuidv4();
    const collab = {
      id,
      project_id: data.projectId,
      agent_id: data.agentId,
      role: data.role || 'collaborator',
      pitch: data.pitch || null,
      status: data.status || 'pending',
      joined_at: new Date().toISOString()
    };
    db.collaborations[id] = collab;
    save();
    return collab;
  },

  findByProjectAndAgent(projectId, agentId) {
    return Object.values(db.collaborations).find(
      c => c.project_id === projectId && c.agent_id === agentId
    );
  },

  findByProject(projectId) {
    return Object.values(db.collaborations).filter(c => c.project_id === projectId);
  },

  findByAgent(agentId) {
    return Object.values(db.collaborations).filter(c => c.agent_id === agentId);
  },

  update(id, data) {
    const collab = db.collaborations[id];
    if (!collab) return null;
    Object.assign(collab, data);
    save();
    return collab;
  },

  delete(projectId, agentId) {
    const collab = this.findByProjectAndAgent(projectId, agentId);
    if (collab) {
      delete db.collaborations[collab.id];
      save();
    }
  },

  countAccepted(projectId) {
    return Object.values(db.collaborations).filter(
      c => c.project_id === projectId && c.status === 'accepted'
    ).length;
  }
};

// Update operations
const updates = {
  create(data) {
    const id = uuidv4();
    const update = {
      id,
      project_id: data.projectId,
      agent_id: data.agentId,
      content: data.content,
      created_at: new Date().toISOString()
    };
    db.updates[id] = update;
    save();
    return update;
  },

  findByProject(projectId) {
    return Object.values(db.updates)
      .filter(u => u.project_id === projectId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
};

// Comment operations
const comments = {
  create(data) {
    const id = uuidv4();
    const comment = {
      id,
      project_id: data.projectId,
      agent_id: data.agentId,
      content: data.content,
      created_at: new Date().toISOString()
    };
    db.comments[id] = comment;
    save();
    return comment;
  },

  findByProject(projectId) {
    return Object.values(db.comments)
      .filter(c => c.project_id === projectId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
};

module.exports = {
  agents,
  projects,
  collaborations,
  updates,
  comments,
  uuidv4,
  generateApiKey,
  slugify,
  uniqueSlug
};
