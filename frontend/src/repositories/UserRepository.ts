import {
  UserAccount,
  UserAccountStatus,
  UserRole,
} from "@/models/UserAccount";

export class UserRepository {
  private static instance: UserRepository | null = null;
  private readonly users: UserAccount[];

  private constructor() {
    this.users = [
      new UserAccount("u1", "John Doe", "john@example.com", UserRole.ADMIN, 12, UserAccountStatus.APPROVED),
      new UserAccount("u2", "Jane Smith", "jane@example.com", UserRole.USER, 8, UserAccountStatus.APPROVED),
      new UserAccount("u3", "Bob Wilson", "bob@example.com", UserRole.USER, 15, UserAccountStatus.PENDING),
      new UserAccount("u4", "Alice Brown", "alice@example.com", UserRole.USER, 3, UserAccountStatus.REJECTED),
      new UserAccount("u5", "Charlie Davis", "charlie@example.com", UserRole.USER, 6, UserAccountStatus.APPROVED),
    ];
  }

  public static getInstance(): UserRepository {
    if (UserRepository.instance === null) {
      UserRepository.instance = new UserRepository();
    }

    return UserRepository.instance;
  }

  public getAll(): UserAccount[] {
    return [...this.users];
  }

  public getById(id: string): UserAccount | undefined {
    return this.users.find((user) => user.id === id);
  }

  public search(query: string): UserAccount[] {
    return this.users.filter((user) => user.matchesSearch(query));
  }

  public deleteById(id: string): void {
    const index = this.users.findIndex((user) => user.id === id);
    if (index >= 0) {
      this.users.splice(index, 1);
    }
  }

  public add(user: UserAccount): void {
    this.users.push(user);
  }

  public getTotalCount(): number {
    return this.users.length;
  }
}
