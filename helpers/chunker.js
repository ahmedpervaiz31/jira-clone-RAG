export function chunkBoard(board) {
    const memberList = board.members?.map(m => typeof m === 'object' ? m.username : m).join(', ');
    return `Board: ${board.name}. 
            Key: ${board.key}. 
            Members: ${memberList || 'None'}.`;
}


export function chunkTask(task, boardName = 'Unknown') {
    return `Task: ${task.title}. 
            Board: ${boardName}. 
            Status: ${task.status}. 
            Assigned to: ${task.assignedTo || 'Unassigned'}. 
            Description: ${task.description || 'No description'}. 
            Due: ${task.dueDate || 'No due date'}`;
}


export function chunkUser(user, taskCount = 0) {
    return `User: ${user.username}. 
            Tasks Assigned: ${taskCount}. 
            Status: ${taskCount === 0 ? 'Available' : 'Busy'}`;
}

export function chunkObject(obj) {
	if (obj.name && obj.key) return chunkBoard(obj);
	if (obj.title && obj.status) return chunkTask(obj);
	if (obj.username) return chunkUser(obj);
	return '';
}