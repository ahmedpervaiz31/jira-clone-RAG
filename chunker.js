export function chunkBoard(board) {
	return `Board: ${board.name}. 
            Key: ${board.key}. 
            Members: ${board.members?.map(m => m.username).join(', ') || ''}. 
            Privacy: ${board.flag}`;
}

export function chunkTask(task) {
	return `Task: ${task.title}. 
            Description: ${task.description || ''}. 
            Status: ${task.status}. 
            Assigned to: ${task.assignedTo || 'unassigned'}. 
            Due: ${task.dueDate || 'none'}`;
}

export function chunkUser(user) {
	return `User: ${user.username}`;
}

export function chunkObject(obj) {
	if (obj.name && obj.key) return chunkBoard(obj);
	if (obj.title && obj.status) return chunkTask(obj);
	if (obj.username) return chunkUser(obj);
	return '';
}
