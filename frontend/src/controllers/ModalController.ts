export class ModalController {
  public static readonly animationDurationMilliseconds = 150;

  public isOpen: boolean;
  public isClosing: boolean;

  public constructor(isOpen: boolean = false, isClosing: boolean = false) {
    this.isOpen = isOpen;
    this.isClosing = isClosing;
  }

  public clone(): ModalController {
    return new ModalController(this.isOpen, this.isClosing);
  }

  public open(): void {
    this.isOpen = true;
    this.isClosing = false;
  }

  public close(): void {
    this.isOpen = false;
    this.isClosing = false;
  }

  public toggle(): void {
    if (this.isOpen || this.isClosing) {
      this.close();
      return;
    }

    this.open();
  }

  public beginClose(): void {
    this.isOpen = false;
    this.isClosing = true;
  }
}
