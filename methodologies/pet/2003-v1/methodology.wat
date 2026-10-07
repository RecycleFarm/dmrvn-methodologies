(module
  (func (export "compute") (param $petBottleCount i32) (result i32)
    local.get $petBottleCount
    i32.const 20
    i32.mul))
