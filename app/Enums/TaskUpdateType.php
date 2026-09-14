<?php

namespace App\Enums;

enum TaskUpdateType: string
{
    case Created = 'created';
    case Update = 'update';            // status and/or progress and/or remark from the quick-update form
    case Remark = 'remark';            // remark only
    case Assignment = 'assignment';    // primary assignee changed
    case DetailsChanged = 'details';   // title/dates/priority edited
    case AutoDelayed = 'auto_delayed'; // system: due date passed
    case Undelayed = 'undelayed';      // system: due date extended, status restored
    case Rollup = 'rollup';            // system: parent progress recalculated from subtasks

    public function label(): string
    {
        return match ($this) {
            self::Created => 'Created',
            self::Update => 'Progress update',
            self::Remark => 'Remark',
            self::Assignment => 'Reassigned',
            self::DetailsChanged => 'Details changed',
            self::AutoDelayed => 'Automatically marked delayed',
            self::Undelayed => 'Delay cleared',
            self::Rollup => 'Updated from subtasks',
        };
    }

    public function isSystem(): bool
    {
        return in_array($this, [self::AutoDelayed, self::Undelayed, self::Rollup], true);
    }
}
