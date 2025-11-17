/**
 * Format date as "dd mmm yy" (e.g., "01 Jan 24", "15 Mar 25")
 */
export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  
  if (isNaN(date.getTime())) return '';
  
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  
  return `${day} ${month} ${year}`;
}
