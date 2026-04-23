type SaveToastProps = {
  message: string;
};

export const SaveToast = ({ message }: SaveToastProps): JSX.Element => {
  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-[8px] bg-[color:var(--accent-green)] px-5 py-2.5 text-[0.875rem] text-white shadow-lg">
      {message}
    </div>
  );
};
