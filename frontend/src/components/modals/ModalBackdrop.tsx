type ModalBackdropProps = {
  onClick: () => void;
  isClosing: boolean;
  children: JSX.Element;
};

class ModalBackdropStyles {
  public static readonly baseClassName =
    "fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4";
  public static readonly openingClassName = "animate-[modalBackdropFadeIn_150ms_ease-out_forwards]";
  public static readonly closingClassName = "animate-[modalBackdropFadeOut_150ms_ease-out_forwards]";
}

export const ModalBackdrop = ({
  onClick,
  isClosing,
  children,
}: ModalBackdropProps): JSX.Element => {
  const animationClassName = isClosing
    ? ModalBackdropStyles.closingClassName
    : ModalBackdropStyles.openingClassName;

  return (
    <div
      className={`${ModalBackdropStyles.baseClassName} ${animationClassName}`}
      onClick={onClick}
      aria-hidden="true"
    >
      {children}
    </div>
  );
};
