'use client';

import type { ComponentProps } from 'react';

/** A filter control that submits its GET form as soon as it changes (onchange="this.form.submit()"). */
export function AutoSubmitSelect(props: (ComponentProps<'select'> & { as?: 'select' }) | (ComponentProps<'input'> & { as: 'checkbox' })) {
    if (props.as === 'checkbox') {
        const { as: _as, ...rest } = props;
        return <input type="checkbox" {...rest} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
    }
    const { as: _as, ...rest } = props;
    return <select {...rest} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
