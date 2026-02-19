const { expect } = require("chai");
const { ethers } = require("hardhat");

async function expectRevert(promise, expectedMessage) {
  try {
    await promise;
    expect.fail("Expected transaction to revert");
  } catch (error) {
    expect(error.message).to.include(expectedMessage);
  }
}

describe("ValidatorManager (Hardhat)", function () {
  async function deployFixture() {
    const signers = await ethers.getSigners();
    const [validator1, validator2, validator3, candidate, outsider] = signers;

    const ValidatorManager = await ethers.getContractFactory("ValidatorManager");
    const contract = await ValidatorManager.deploy([
      validator1.address,
      validator2.address,
      validator3.address,
    ]);
    await contract.waitForDeployment();

    return { contract, validator1, validator2, validator3, candidate, outsider };
  }

  it("requires quorum to add a validator", async function () {
    const { contract, validator1, validator2, candidate } = await deployFixture();

    const proposalId = await contract
      .connect(validator1)
      .proposeAddValidator.staticCall(candidate.address);

    await (await contract.connect(validator1).proposeAddValidator(candidate.address)).wait();

    expect(await contract.isValidator(candidate.address)).to.equal(false);

    await (await contract.connect(validator2).approveProposal(proposalId)).wait();
    expect(await contract.isValidator(candidate.address)).to.equal(true);
  });

  it("prevents removing the last validator", async function () {
    const [onlyValidator] = await ethers.getSigners();
    const ValidatorManager = await ethers.getContractFactory("ValidatorManager");
    const single = await ValidatorManager.deploy([onlyValidator.address]);
    await single.waitForDeployment();

    await expectRevert(
      single.connect(onlyValidator).proposeRemoveValidator(onlyValidator.address),
      "Cannot remove last validator"
    );
  });

  it("blocks non-validators from proposing", async function () {
    const { contract, outsider } = await deployFixture();

    await expectRevert(
      contract.connect(outsider).proposeAddValidator(outsider.address),
      "Not a validator"
    );
  });
});
