(module
  (func (export "compute") (param $waterIntakeMl i32) (result i32)
    local.get $waterIntakeMl
    i32.const 500
    i32.div_u
    i32.const 20
    i32.mul))
