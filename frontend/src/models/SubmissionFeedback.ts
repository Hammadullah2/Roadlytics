export class SubmissionFeedback {
  public readonly message: string;

  public constructor(message: string = "") {
    this.message = message;
  }

  public static empty(): SubmissionFeedback {
    return new SubmissionFeedback();
  }

  public static fromJob(jobId: string): SubmissionFeedback {
    return new SubmissionFeedback(`Job ${jobId} started successfully`);
  }

  public hasMessage(): boolean {
    return this.message.trim().length > 0;
  }
}
