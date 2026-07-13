export default function WelcomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
      <div className="max-w-md">
        <h1 className="mb-4 text-3xl font-semibold text-black dark:text-zinc-50">
          You&rsquo;re in.
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Your 30-day free trial has started. Download TapOwner and log in
          with the same email you just used.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          App Store link coming soon — for founding agents, TestFlight
          invites go out separately.
        </p>
      </div>
    </div>
  );
}
