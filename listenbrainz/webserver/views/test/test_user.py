
from listenbrainz.webserver.testing import ServerTestCase
from flask import url_for
import listenbrainz.db.user as db_user
from listenbrainz.db.testing import DatabaseTestCase
import urllib
import time
import ujson

class UserViewsTestCase(ServerTestCase, DatabaseTestCase):
    def setUp(self):
        ServerTestCase.setUp(self)
        DatabaseTestCase.setUp(self)
        self.user = db_user.get_or_create('iliekcomputers')
        self.weirduser = db_user.get_or_create('weird\\user name')

    def test_user_page(self):
        response = self.client.get(url_for('user.profile', user_name=self.user['musicbrainz_id']))
        self.assert200(response)

    def test_scraper_username(self):
        response = self.client.get(
            url_for('user.lastfmscraper', user_name=self.user['musicbrainz_id']),
            query_string={
                'user_token': self.user['auth_token'],
                'lastfm_username': 'dummy',
            }
        )
        self.assert200(response)
        self.assertIn('var user_name = "{}";'.format(urllib.parse.quote_plus(self.user['musicbrainz_id'])), response.data.decode('utf-8'))

        print(url_for('user.lastfmscraper', user_name=self.weirduser['musicbrainz_id']))
        response = self.client.get(
            url_for('user.lastfmscraper', user_name=self.weirduser['musicbrainz_id']),
            query_string={
                'user_token': self.weirduser['auth_token'],
                'lastfm_username': 'dummy',
            }
        )
        self.assert200(response)
        # the username should be escaped in the template because it is in quotes
        self.assertIn('var user_name = "{}";'.format(urllib.parse.quote_plus(self.weirduser['musicbrainz_id'])), response.data.decode('utf-8'))

    def tearDown(self):
        ServerTestCase.tearDown(self)
        DatabaseTestCase.tearDown(self)
