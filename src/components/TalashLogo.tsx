export function TalashLogoMark({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect width="40" height="40" rx="11" fill="#18181B" />
      <rect x="1.5" y="1.5" width="37" height="37" rx="9.5" stroke="#27272A" strokeWidth="1" />
      <path
        d="M20 7.2L23 15L30.8 18L23 21L20 28.8L17 21L9.2 18L17 15L20 7.2Z"
        stroke="#10A37F"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="18" r="2.8" fill="#FFFFFF" />
      <path
        d="M12.2 31.4C14.5 29.7 17.2 28.8 20 28.8C22.8 28.8 25.5 29.7 27.8 31.4"
        stroke="#10A37F"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
