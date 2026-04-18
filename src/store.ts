export interface TraineeRecord {
  userId: string;
  username: string;
  acceptedAt: Date;
  acceptedBy: string;
}

export interface TicketApplication {
  userId: string;
  username: string;
  channelId: string;
  appliedAt: Date;
  name: string;
  role: string;
  department: string;
  reason: string;
}

const trainees = new Map<string, TraineeRecord>();
const tickets = new Map<string, TicketApplication>();

export function addTrainee(record: TraineeRecord): void {
  trainees.set(record.userId, record);
}

export function getTrainee(userId: string): TraineeRecord | undefined {
  return trainees.get(userId);
}

export function getAllTrainees(): TraineeRecord[] {
  return Array.from(trainees.values());
}

export function removeTrainee(userId: string): boolean {
  return trainees.delete(userId);
}

export function isTrainee(userId: string): boolean {
  return trainees.has(userId);
}

export function addTicket(app: TicketApplication): void {
  tickets.set(app.userId, app);
}

export function getTicket(userId: string): TicketApplication | undefined {
  return tickets.get(userId);
}

export function getAllTickets(): TicketApplication[] {
  return Array.from(tickets.values());
}

export function getTicketByChannelId(channelId: string): TicketApplication | undefined {
  for (const ticket of tickets.values()) {
    if (ticket.channelId === channelId) return ticket;
  }
  return undefined;
}

export function removeTicket(userId: string): boolean {
  return tickets.delete(userId);
}
