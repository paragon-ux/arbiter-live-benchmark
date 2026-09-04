export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: string;
}

export class UserStore {
  private users = new Map<string, UserRecord>();

  save(user: UserRecord): void {
    this.users.set(user.email.toLowerCase(), user);
  }

  findByEmail(email: string): UserRecord | null {
    return this.users.get(email.toLowerCase()) || null;
  }

  findById(id: string): UserRecord | null {
    for (const user of this.users.values()) {
      if (user.id === id) return user;
    }
    return null;
  }
}
