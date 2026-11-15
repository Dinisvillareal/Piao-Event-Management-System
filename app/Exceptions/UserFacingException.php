<?php

namespace App\Exceptions;

/**
 * An error whose message is written for staff to read and is safe to show on screen
 * (e.g. "Not enough stock for Chairs (available: 12, requested: 20)").
 *
 * Any OTHER exception (a database error, a bug) is treated as internal: its text is
 * written to the server log and the screen only shows a generic message. See
 * Controller::safeError().
 */
class UserFacingException extends \RuntimeException
{
}
