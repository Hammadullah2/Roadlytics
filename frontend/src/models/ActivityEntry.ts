export class ActivityEntry {
  public readonly id: string;
  public readonly user: string;
  public readonly action: string;
  public readonly project: string;
  public readonly timeAgo: string;

  public constructor(
    id: string,
    user: string,
    action: string,
    project: string,
    timeAgo: string,
  ) {
    this.id = id;
    this.user = user;
    this.action = action;
    this.project = project;
    this.timeAgo = timeAgo;
  }
}
