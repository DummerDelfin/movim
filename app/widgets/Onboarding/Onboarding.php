<?php

use Movim\Widget\Base;

class Onboarding extends Base
{
    public function load()
    {
        $this->addcss('onboarding.css');
        $this->addjs('onboarding.js');
    }

    public function ajaxAskNotifications()
    {
        $tpl = $this->tpl();
        $this->rpc('Onboarding.setNotifications');
        Dialog::fill($tpl->draw('_onboarding_notifications', true));
    }

    public function ajaxAskPublic()
    {
        $tpl = $this->tpl();
        $this->rpc('Onboarding.setPublic');

        if ($this->user->public == null) {
            Dialog::fill($tpl->draw('_onboarding_public'));
        }
    }

    public function ajaxAskPopups()
    {
        $tpl = $this->tpl();
        Dialog::fill($tpl->draw('_onboarding_popups'));
        $this->rpc('Onboarding.setPopups');
    }

    public function ajaxEnablePublic()
    {
        $this->user->setPublic();
        Notification::toast($this->__('vcard.public'));
    }

    public function ajaxEnableRestricted()
    {
        $this->user->setPrivate();
        Notification::toast($this->__('vcard.restricted'));
    }
}
