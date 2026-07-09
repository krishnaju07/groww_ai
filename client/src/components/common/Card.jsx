export function Card({ className = '', children, hover = false, ...rest }) {
  return (
    <div className={`${hover ? 'glass-card-hover' : 'glass-card'} p-5 ${className}`} {...rest}>
      {children}
    </div>
  );
}
