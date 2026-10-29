const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicJson } = require('./store.cjs');
class Folders {
  constructor(store) {
    this.store = store;
    this.file = path.join(store.base, 'folders.json');
  }
  read() {
    if (fs.existsSync(this.file)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (
          data.schemaVersion !== 1 ||
          !Array.isArray(data.folders) ||
          data.folders.length > 200 ||
          data.folders.some(
            (f) =>
              !f ||
              typeof f.id !== 'string' ||
              typeof f.name !== 'string' ||
              !Array.isArray(f.projectIds) ||
              f.projectIds.some((id) => typeof id !== 'string'),
          )
        )
          throw new Error('分类数据无效');
        return data;
      } catch {
        fs.copyFileSync(this.file, this.file + '.corrupt.' + Date.now());
      }
    }
    const folders = [];
    for (const project of this.store.list()) {
      const name = project.playlist?.trim();
      if (!name || ['未分类项目', '未分类', 'Uncategorized'].includes(name)) continue;
      let folder = folders.find((item) => item.name === name);
      if (!folder) folders.push((folder = { id: crypto.randomUUID(), name, projectIds: [] }));
      folder.projectIds.push(project.id);
    }
    const data = { schemaVersion: 1, folders };
    atomicJson(this.file, data);
    return data;
  }
  list() {
    const ids = new Set(this.store.list().map((project) => project.id));
    return this.read().folders.map((folder) => ({
      ...folder,
      projectIds: folder.projectIds.filter((id) => ids.has(id)),
    }));
  }
  edit({ action, id, name, projectId }) {
    const data = this.read(),
      folder = data.folders.find((item) => item.id === id);
    if (['create', 'rename'].includes(action)) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 60)
        throw new Error('分类名称需要 1–60 个字');
      name = name.trim();
      if (
        data.folders.some(
          (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && item.id !== id,
        )
      )
        throw new Error('已有同名分类');
    }
    if (action === 'create') {
      if (data.folders.length >= 200) throw new Error('分类数量已达上限');
      data.folders.push({ id: crypto.randomUUID(), name, projectIds: [] });
    } else if (action === 'rename' && folder) folder.name = name;
    else if (action === 'delete' && folder)
      data.folders = data.folders.filter((item) => item.id !== id);
    else if (action === 'move' && (!id || folder)) {
      this.store.get(projectId);
      for (const item of data.folders)
        item.projectIds = item.projectIds.filter((value) => value !== projectId);
      if (folder) folder.projectIds.push(projectId);
    } else throw new Error('分类不存在');
    atomicJson(this.file, data);
    return this.list();
  }
}
module.exports = { Folders };
