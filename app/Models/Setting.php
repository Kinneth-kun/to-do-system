<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Raw key/value storage. Read and write through App\Services\Settings. */
class Setting extends Model
{
    protected $fillable = ['key', 'value'];
}
