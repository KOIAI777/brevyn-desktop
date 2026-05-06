export function Markdownish({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="whitespace-pre-wrap break-words">
      {lines.map((line, index) => (
        <span key={`${line}-${index}`}>
          {line}
          {index < lines.length - 1 && <br />}
        </span>
      ))}
    </div>
  );
}
