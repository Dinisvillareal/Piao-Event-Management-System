<?php

namespace App\Exceptions;

/** Another request held the same "one at a time" lock for too long (see App\Support\Mutex). */
class MutexBusyException extends \RuntimeException
{
}
