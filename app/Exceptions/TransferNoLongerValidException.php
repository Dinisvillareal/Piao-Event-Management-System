<?php

namespace App\Exceptions;

/** Thrown inside the Head Staff hand-over transaction to roll it back. */
class TransferNoLongerValidException extends \RuntimeException
{
}
