// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.38;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Project} from "./Project.sol";

/// Test-only faucet, never a production asset. Public mint is intentional.
contract TestPayment is ERC20 {
    constructor() ERC20("Local test units", "TEST") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
contract TaxPayment is ERC20 {
    constructor() ERC20("Fee-on-transfer test", "TAX") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0) && amount > 1) {
            super._update(from, address(0), 1); super._update(from, to, amount - 1);
        } else super._update(from, to, amount);
    }
}
/// Simulates a malicious payment asset callback during transferFrom/withdrawal.
contract CallbackPayment is ERC20 {
    address public target;
    bytes public callback;
    bool public attempted;
    bool public succeeded;
    bool private entered;
    constructor() ERC20("Callback test", "CALL") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function configure(address target_, bytes calldata callback_) external {
        target = target_; callback = callback_; attempted = false; succeeded = false;
    }
    function _update(address from, address to, uint256 amount) internal override {
        super._update(from, to, amount);
        if (!entered && from != address(0) && to != address(0) && target != address(0)) {
            entered = true; attempted = true; (succeeded,) = target.call(callback); entered = false;
        }
    }
}
