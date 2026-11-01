import * as Primitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import {
  Children,
  isValidElement,
  useRef,
  type ChangeEvent,
  type SelectHTMLAttributes,
  type ReactNode,
} from 'react';
import { isAndroid } from '../platform/environment';

/** Native desktop control, accessible animated mobile menu. */
export default function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const native = useRef<HTMLSelectElement>(null);
  if (!isAndroid) return <select {...props} />;
  const options: { value: string; label: ReactNode; disabled?: boolean }[] = [];
  const collect = (children: ReactNode) =>
    Children.forEach(children, (child) => {
      if (
        !isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(
          child,
        )
      )
        return;
      if (child.type === 'option')
        options.push({
          value: String(child.props.value ?? child.props.children ?? ''),
          label: child.props.children,
          disabled: child.props.disabled,
        });
      else collect(child.props.children);
    });
  collect(props.children);
  const value = String(props.value ?? props.defaultValue ?? options[0]?.value ?? '');
  return (
    <>
      <select {...props} ref={native} hidden aria-hidden="true" tabIndex={-1} />
      <Primitive.Root
        value={'v:' + value}
        disabled={props.disabled}
        onValueChange={(selected) => {
          if (!native.current) return;
          native.current.value = selected.slice(2);
          props.onChange?.({
            target: native.current,
            currentTarget: native.current,
          } as ChangeEvent<HTMLSelectElement>);
        }}
      >
        <Primitive.Trigger
          className={'mobile-select-trigger ' + (props.className || '')}
          aria-label={props['aria-label']}
          title={props.title}
          style={props.style}
        >
          <Primitive.Value />
          <Primitive.Icon>
            <ChevronDown size={15} />
          </Primitive.Icon>
        </Primitive.Trigger>
        <Primitive.Portal>
          <Primitive.Content
            className="mobile-select-menu"
            position="popper"
            sideOffset={6}
            collisionPadding={12}
          >
            <Primitive.Viewport>
              {options.map((option) => (
                <Primitive.Item
                  className="mobile-select-option"
                  key={option.value}
                  value={'v:' + option.value}
                  disabled={option.disabled}
                >
                  <Primitive.ItemText>{option.label}</Primitive.ItemText>
                  <Primitive.ItemIndicator>
                    <Check size={16} />
                  </Primitive.ItemIndicator>
                </Primitive.Item>
              ))}
            </Primitive.Viewport>
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </>
  );
}
