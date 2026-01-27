import Board from '../../jira-backend/models/Board.model.js';
import Task from '../../jira-backend/models/Task.model.js';
import User from '../../jira-backend/models/User.model.js';

export async function upsertGlobalSummary(index, performUpsert, data = null) {
    const boards = data?.boards || await Board.find().lean();
    const tasks = data?.tasks || await Task.find().lean();
    const users = data?.users || await User.find().lean();

    const summaryText = `Boards: ${boards.length}. Tasks: ${tasks.length}. Users: ${users.length}. 
        Board names: ${boards.map(b => b.name).join(', ')}. 
        Usernames: ${users.map(u => u.username).join(', ')}`;

    await performUpsert('summary', 'global', summaryText, {
        type: 'summary',
        boardCount: boards.length,
        taskCount: tasks.length,
        userCount: users.length,
        boardNames: boards.map(b => b.name),
        userNames: users.map(u => u.username),
        textChunk: summaryText 
    });
}