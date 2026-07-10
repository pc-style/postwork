import {
  cloneElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";

type FieldControlProps = {
  id?: string;
  required?: boolean;
  "aria-required"?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export function FormField({
  label,
  help,
  error,
  required = false,
  optional = false,
  srOnlyLabel = false,
  className = "",
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optional?: boolean;
  srOnlyLabel?: boolean;
  className?: string;
  children: ReactElement<FieldControlProps>;
}) {
  const generatedId = useId();
  const controlId = children.props.id ?? `${generatedId}-control`;
  const helpId = help ? `${generatedId}-help` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], helpId, errorId]
    .filter(Boolean)
    .join(" ") || undefined;

  const control = cloneElement(children, {
    id: controlId,
    required: children.props.required ?? required,
    "aria-required": required || undefined,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : children.props["aria-invalid"],
  });

  return (
    <div className={`grid gap-1.5 ${className}`.trim()}>
      <label
        htmlFor={controlId}
        className={srOnlyLabel ? "sr-only" : "text-sm font-medium text-fg"}
      >
        {label}
        {required ? <span className="ml-1 text-muted">required</span> : null}
        {optional ? <span className="ml-1 font-normal text-muted">optional</span> : null}
      </label>
      {control}
      {help ? (
        <p id={helpId} className="text-xs leading-5 text-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="ui-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
