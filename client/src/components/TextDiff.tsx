import { useMemo } from 'react';

interface DiffPart {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
}

function computeDiff(original: string, current: string): DiffPart[] {
  // Simple word-level diff algorithm
  const originalWords = original.split(/(\s+)/);
  const currentWords = current.split(/(\s+)/);
  
  const result: DiffPart[] = [];
  let i = 0, j = 0;
  
  while (i < originalWords.length || j < currentWords.length) {
    if (i >= originalWords.length) {
      // Remaining words are added
      result.push({ type: 'added', text: currentWords.slice(j).join('') });
      break;
    }
    
    if (j >= currentWords.length) {
      // Remaining words are removed
      result.push({ type: 'removed', text: originalWords.slice(i).join('') });
      break;
    }
    
    if (originalWords[i] === currentWords[j]) {
      // Words match - unchanged
      result.push({ type: 'unchanged', text: originalWords[i] });
      i++;
      j++;
    } else {
      // Look ahead to find matching word
      let foundMatch = false;
      
      // Check if current word appears later in original
      for (let k = i + 1; k < Math.min(i + 5, originalWords.length); k++) {
        if (originalWords[k] === currentWords[j]) {
          // Words were removed
          result.push({ type: 'removed', text: originalWords.slice(i, k).join('') });
          i = k;
          foundMatch = true;
          break;
        }
      }
      
      if (!foundMatch) {
        // Check if original word appears later in current
        for (let k = j + 1; k < Math.min(j + 5, currentWords.length); k++) {
          if (currentWords[k] === originalWords[i]) {
            // Words were added
            result.push({ type: 'added', text: currentWords.slice(j, k).join('') });
            j = k;
            foundMatch = true;
            break;
          }
        }
      }
      
      if (!foundMatch) {
        // No match found - treat as replacement
        result.push({ type: 'removed', text: originalWords[i] });
        result.push({ type: 'added', text: currentWords[j] });
        i++;
        j++;
      }
    }
  }
  
  return result;
}

interface TextDiffProps {
  originalAiValue: string;
  currentValue: string;
  className?: string;
}

export function TextDiff({ originalAiValue, currentValue, className = '' }: TextDiffProps) {
  const diffParts = useMemo(() => {
    return computeDiff(originalAiValue, currentValue);
  }, [originalAiValue, currentValue]);
  
  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {diffParts.map((part, index) => {
        if (part.type === 'removed') {
          // Don't show removed text, it's been deleted by user
          return null;
        }
        
        if (part.type === 'added') {
          // User-added text in default color (white/black)
          return <span key={index}>{part.text}</span>;
        }
        
        // Unchanged AI text in blue
        return (
          <span key={index} className="text-blue-600 dark:text-blue-400">
            {part.text}
          </span>
        );
      })}
    </div>
  );
}
