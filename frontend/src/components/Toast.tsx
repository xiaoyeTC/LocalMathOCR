type Props = { message: string };

export function Toast({ message }: Props) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white shadow-2xl dark:bg-white dark:text-slate-950">
      {message}
    </div>
  );
}
